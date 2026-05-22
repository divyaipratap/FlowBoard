/**
 * Track C — RelayTransport implementation.
 *
 * Speaks the y-websocket wire protocol over a standard WebSocket connection
 * to a configurable public relay. Wraps each frame in the Envelope format
 * defined by the shared interface (lib/sync/src/index.ts).
 *
 * Contract (from RelayTransport interface):
 *   - Never inspect, log, or modify the ciphertext field of an Envelope.
 *   - Reconnect with exponential backoff (cap 30s) on transient disconnect.
 *   - Buffer outbound messages while disconnected and replay on reconnect.
 *   - Expose state changes via onStateChange for the UI status indicator.
 */

import type { Envelope, RelayTransport, RoomId, TransportState } from "../index.js";
import { OfflineQueue, computeBackoff } from "./offline-queue.js";
import { encodeMessage, decodeMessage, MessageType, uint8ToBase64, base64ToUint8 } from "./y-websocket-protocol.js";

export type { Envelope, RelayTransport, RoomId, TransportState };
export { OfflineQueue, computeBackoff } from "./offline-queue.js";
export { encodeMessage, decodeMessage, MessageType, uint8ToBase64, base64ToUint8 } from "./y-websocket-protocol.js";

type MessageHandler = (envelope: Envelope) => void;
type StateHandler = (state: TransportState) => void;

/**
 * Serialize an Envelope to a binary frame for the relay.
 * Uses the y-websocket SYNC_UPDATE message type as the carrier.
 *
 * Wire format:
 *   [1 byte: y-ws msg type = 2 (update)]
 *   [4 bytes: version (uint32 LE)]
 *   [4 bytes: nonce length (uint32 LE)]
 *   [N bytes: nonce]
 *   [4 bytes: ciphertext length (uint32 LE)]
 *   [M bytes: ciphertext]
 *   [remaining: mac]
 */
function serializeEnvelope(envelope: Envelope): Uint8Array {
  const nonceLen = envelope.nonce.length;
  const ctLen = envelope.ciphertext.length;
  const macLen = envelope.mac.length;

  // Total payload: 4 (version) + 4 (nonceLen) + nonce + 4 (ctLen) + ct + mac
  const payloadSize = 4 + 4 + nonceLen + 4 + ctLen + macLen;
  const payload = new Uint8Array(payloadSize);
  const view = new DataView(payload.buffer);

  let offset = 0;
  view.setUint32(offset, envelope.version, true);
  offset += 4;
  view.setUint32(offset, nonceLen, true);
  offset += 4;
  payload.set(envelope.nonce, offset);
  offset += nonceLen;
  view.setUint32(offset, ctLen, true);
  offset += 4;
  payload.set(envelope.ciphertext, offset);
  offset += ctLen;
  payload.set(envelope.mac, offset);

  return encodeMessage(MessageType.SYNC_UPDATE, payload);
}

/**
 * Deserialize a binary frame from the relay back into an Envelope.
 * Returns null if the frame is malformed or not a SYNC_UPDATE.
 */
function deserializeEnvelope(frame: Uint8Array): Envelope | null {
  const msg = decodeMessage(frame);
  if (!msg) return null;

  // We only handle SYNC_UPDATE frames (type 2). Ignore awareness/sync-step.
  if (msg.type !== MessageType.SYNC_UPDATE) return null;

  const payload = msg.payload;
  if (payload.length < 12) return null; // minimum: version + nonceLen + ctLen

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;

  const version = view.getUint32(offset, true);
  if (version !== 1) return null;
  offset += 4;

  const nonceLen = view.getUint32(offset, true);
  offset += 4;
  if (offset + nonceLen > payload.length) return null;
  const nonce = payload.slice(offset, offset + nonceLen);
  offset += nonceLen;

  if (offset + 4 > payload.length) return null;
  const ctLen = view.getUint32(offset, true);
  offset += 4;
  if (offset + ctLen > payload.length) return null;
  const ciphertext = payload.slice(offset, offset + ctLen);
  offset += ctLen;

  const mac = payload.slice(offset);

  return { version: 1, nonce, ciphertext, mac };
}

/**
 * WebSocket-based RelayTransport that speaks the y-websocket wire protocol.
 */
export class WebSocketRelayTransport implements RelayTransport {
  private ws: WebSocket | null = null;
  private currentState: TransportState = "idle";
  private messageHandlers = new Set<MessageHandler>();
  private stateHandlers = new Set<StateHandler>();
  private offlineQueue = new OfflineQueue();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private relayUrl: string | null = null;
  private roomId: RoomId | null = null;
  private intentionalDisconnect = false;

  async connect(relayUrl: string, roomId: RoomId): Promise<void> {
    this.relayUrl = relayUrl;
    this.roomId = roomId;
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;
    await this.openSocket();
  }

  send(envelope: Envelope): void {
    if (this.currentState === "connected" && this.ws?.readyState === WebSocket.OPEN) {
      const frame = serializeEnvelope(envelope);
      this.ws.send(frame);
    } else {
      // Buffer while disconnected — replay on reconnect.
      this.offlineQueue.enqueue(envelope);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  state(): TransportState {
    return this.currentState;
  }

  queuedCount(): number {
    return this.offlineQueue.count;
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close(1000, "client disconnect");
      this.ws = null;
    }
    this.setState("idle");
  }

  // --- Private ---

  private async openSocket(): Promise<void> {
    if (!this.relayUrl || !this.roomId) return;

    this.setState("connecting");

    // y-websocket convention: append room name to the relay URL path.
    const url = this.relayUrl.replace(/\/$/, "") + "/" + this.roomId;

    try {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.setState("connected");
        this.flushQueue();
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = event.data;
        let frame: Uint8Array;
        if (data instanceof ArrayBuffer) {
          frame = new Uint8Array(data);
        } else if (typeof data === "string") {
          // Some relays send JSON-wrapped base64.
          try {
            const parsed = JSON.parse(data) as { payload?: string };
            frame = parsed.payload ? base64ToUint8(parsed.payload) : new Uint8Array(0);
          } catch {
            return; // Ignore unparseable text frames.
          }
        } else {
          return;
        }

        const envelope = deserializeEnvelope(frame);
        if (envelope) {
          for (const handler of this.messageHandlers) {
            handler(envelope);
          }
        }
      };

      ws.onclose = (event) => {
        this.ws = null;
        if (!this.intentionalDisconnect) {
          this.setState("disconnected");
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // onerror is always followed by onclose in browsers, so we just
        // let onclose handle the reconnect logic.
        this.setState("error");
      };

      this.ws = ws;
    } catch {
      this.setState("error");
      this.scheduleReconnect();
    }
  }

  private flushQueue(): void {
    if (this.currentState !== "connected" || !this.ws) return;
    const envelopes = this.offlineQueue.drain();
    for (const envelope of envelopes) {
      const frame = serializeEnvelope(envelope);
      this.ws.send(frame);
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;
    this.clearReconnectTimer();

    const delay = computeBackoff(this.reconnectAttempt);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(next: TransportState): void {
    if (next === this.currentState) return;
    this.currentState = next;
    for (const handler of this.stateHandlers) {
      handler(next);
    }
  }
}

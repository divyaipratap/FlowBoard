// FAB-15 — Sync engine (Phase 2a).
//
// One RoomSyncSession per active room:
//   - Y.Doc holds the CRDT state.
//   - Local Y.Doc updates → encrypted → sent via RelayTransport.
//   - Incoming Envelopes → decrypted → applied to the Y.Doc with origin "remote".
//   - Transport state changes → SSE event sync.transport_state for the renderer.
//
// SQLite ↔ Y.Doc bridging is Phase 2b. For now the engine just proves the
// encrypted channel works end-to-end — peers will see each other's connection
// state in the Settings UI and the relay sees ciphertext only.
//
// AAD v1: TextEncoder().encode(`room=${roomId}`).
// Replay protection inside PeerCipher is per-nonce (4096-entry FIFO).
// A monotonic counter per peer would tighten this; left for Phase 2c.

import { randomBytes } from "node:crypto";
import * as Y from "yjs";
import type { Envelope, LocalChange, PeerCipher, RelayTransport, RoomId, TransportState } from "@workspace/sync";
import { WebSocketRelayTransport } from "@workspace/sync/transport";
import { emitFlowBoardEvent } from "../events";
import { getPeerCipher } from "./cipher";
import { listRooms, touchConnected } from "./rooms";
import { applyLocalChangeToDoc, attachRemoteToSqliteBridge } from "./bridge";

function encodeAad(roomId: string): Uint8Array {
  return new TextEncoder().encode(`room=${roomId}`);
}

export class RoomSyncSession {
  readonly roomId: RoomId;
  readonly relayUrl: string;
  readonly senderId: string;
  readonly doc: Y.Doc;

  private readonly cipher: PeerCipher;
  private readonly transport: RelayTransport;
  private readonly aad: Uint8Array;

  private offMessage: (() => void) | null = null;
  private offState: (() => void) | null = null;
  private detachBridge: (() => void) | null = null;
  private onDocUpdate: ((update: Uint8Array, origin: unknown) => void) | null = null;
  private started = false;
  private stopping = false;
  private hasBroadcastInitial = false;
  private lastRemotePeerId: string | null = null;

  constructor(opts: {
    roomId: RoomId;
    relayUrl: string;
    cipher: PeerCipher;
    transport?: RelayTransport;
  }) {
    this.roomId = opts.roomId;
    this.relayUrl = opts.relayUrl;
    this.cipher = opts.cipher;
    this.transport = opts.transport ?? new WebSocketRelayTransport();
    this.senderId = randomBytes(8).toString("hex");
    this.doc = new Y.Doc();
    this.aad = encodeAad(opts.roomId);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.onDocUpdate = (update, origin) => {
      // Skip echoes — updates we just applied from a remote peer.
      if (origin === "remote") return;
      void this.broadcastUpdate(update);
    };
    this.doc.on("update", this.onDocUpdate);

    // Wire the SQLite ↔ Y.Doc bridge so remote updates land in SQLite and
    // emit issue.updated / comment.created / project.changed SSE events.
    this.detachBridge = attachRemoteToSqliteBridge(this.doc, () => this.lastRemotePeerId);

    this.offMessage = this.transport.onMessage((envelope) => {
      void this.applyRemoteEnvelope(envelope);
    });

    this.offState = this.transport.onStateChange((state) => {
      this.publishState(state);
      if (state === "connected") {
        // First contact with the relay — share our current state so a fresh peer can catch up.
        if (!this.hasBroadcastInitial) {
          this.hasBroadcastInitial = true;
          const snapshot = Y.encodeStateAsUpdate(this.doc);
          if (snapshot.length > 2) {
            // 2 bytes = "empty doc" marker; skip to avoid noise.
            void this.broadcastUpdate(snapshot);
          }
        }
        void touchConnected(this.roomId).catch(() => {
          /* best effort */
        });
      }
    });

    await this.transport.connect(this.relayUrl, this.roomId);
    // Publish the post-connect state synchronously so the UI doesn't have to wait
    // for the first onStateChange fire (already published above if it fired).
    this.publishState(this.transport.state());
  }

  async stop(): Promise<void> {
    if (!this.started || this.stopping) return;
    this.stopping = true;
    try {
      this.offMessage?.();
      this.offState?.();
      this.detachBridge?.();
      if (this.onDocUpdate) this.doc.off("update", this.onDocUpdate);
      await this.transport.disconnect();
    } finally {
      this.offMessage = null;
      this.offState = null;
      this.detachBridge = null;
      this.onDocUpdate = null;
      this.started = false;
      this.stopping = false;
      this.hasBroadcastInitial = false;
      this.publishState("idle");
    }
  }

  state(): TransportState {
    return this.transport.state();
  }

  queuedCount(): number {
    return this.transport.queuedCount();
  }

  /**
   * Mirror a local SQLite mutation into the Y.Doc, which triggers the
   * doc.on("update") handler with origin === undefined → broadcast to peers.
   */
  applyLocalChange(change: LocalChange): void {
    if (!this.started) return;
    applyLocalChangeToDoc(this.doc, change);
  }

  private async broadcastUpdate(update: Uint8Array): Promise<void> {
    try {
      const envelope = await this.cipher.encryptForRoom(
        // The key is looked up from the keystore by the cipher implementation —
        // it caches by roomId so we don't pay the keychain round-trip per envelope.
        await this.loadKey(),
        update,
        this.aad,
      );
      this.transport.send(envelope);
    } catch (error) {
      console.error(`[sync] encrypt failed for room ${this.roomId}:`, error);
    }
  }

  private async applyRemoteEnvelope(envelope: Envelope): Promise<void> {
    try {
      const key = await this.loadKey();
      const plaintext = await this.cipher.decryptFromRoom(key, envelope, this.aad);
      Y.applyUpdate(this.doc, plaintext, "remote");
    } catch (error) {
      // MAC failure, replay, bad version — drop silently after a debug log.
      // We do NOT want to surface this to the user UI; it could be transient
      // relay-induced reordering or a stale envelope from a removed peer.
      console.debug(`[sync] decrypt failed for room ${this.roomId}:`, (error as Error).message);
    }
  }

  private cachedKey: Awaited<ReturnType<PeerCipher["loadRoomKey"]>> | null = null;
  private async loadKey() {
    if (this.cachedKey) return this.cachedKey;
    const key = await this.cipher.loadRoomKey(this.roomId);
    if (!key) {
      throw new Error(`No room key found for ${this.roomId} — pairing was lost`);
    }
    this.cachedKey = key;
    return key;
  }

  private publishState(state: TransportState): void {
    emitFlowBoardEvent({ type: "sync.transport_state", transportState: state });
  }
}

class SyncEngineManager {
  private readonly sessions = new Map<string, RoomSyncSession>();

  async startRoom(room: { id: string; relayUrl: string }): Promise<void> {
    if (this.sessions.has(room.id)) return;
    const session = new RoomSyncSession({
      roomId: room.id as RoomId,
      relayUrl: room.relayUrl,
      cipher: getPeerCipher(),
    });
    this.sessions.set(room.id, session);
    try {
      await session.start();
    } catch (error) {
      this.sessions.delete(room.id);
      throw error;
    }
  }

  async stopRoom(roomId: string): Promise<void> {
    const session = this.sessions.get(roomId);
    if (!session) return;
    this.sessions.delete(roomId);
    await session.stop();
  }

  /**
   * Broadcast a local SQLite change to every active room.
   * Called from issue/comment/project routes after their DB write succeeds.
   * No-op if no rooms are active — sync is opt-in.
   */
  applyLocalChange(change: LocalChange): void {
    if (this.sessions.size === 0) return;
    for (const session of this.sessions.values()) {
      try {
        session.applyLocalChange(change);
      } catch (error) {
        console.error(`[sync] applyLocalChange failed for room ${session.roomId}:`, error);
      }
    }
  }

  getSession(roomId: string): RoomSyncSession | null {
    return this.sessions.get(roomId) ?? null;
  }

  async shutdown(): Promise<void> {
    const sessions = Array.from(this.sessions.values());
    this.sessions.clear();
    await Promise.all(sessions.map((s) => s.stop().catch(() => {})));
  }
}

const manager = new SyncEngineManager();

export function getSyncEngineManager(): SyncEngineManager {
  return manager;
}

export async function bootEnabledRooms(): Promise<void> {
  const rooms = await listRooms();
  for (const room of rooms) {
    if (!room.enabled) continue;
    try {
      await manager.startRoom({ id: room.id, relayUrl: room.relayUrl });
    } catch (error) {
      console.error(`[sync] failed to start room ${room.id}:`, error);
    }
  }
}

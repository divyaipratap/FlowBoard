/**
 * y-websocket wire protocol helpers.
 *
 * The y-websocket protocol uses a simple binary framing:
 *   - First byte: message type
 *   - Remaining bytes: payload
 *
 * Message types:
 *   0 = sync step 1 (state vector)
 *   1 = sync step 2 (update)
 *   2 = update (incremental)
 *   3 = awareness (not used in FAB-15 v1)
 *
 * We speak this protocol manually so we can wrap each frame in our own
 * encryption envelope before sending. The relay sees only ciphertext.
 *
 * Reference: https://github.com/yjs/y-websocket/blob/master/src/y-websocket.js
 */

/** y-websocket message type constants. */
export const MessageType = {
  SYNC_STEP_1: 0,
  SYNC_STEP_2: 1,
  SYNC_UPDATE: 2,
  AWARENESS: 3,
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

/**
 * Encode a y-websocket frame: [type byte | payload].
 */
export function encodeMessage(type: MessageTypeValue, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = type;
  frame.set(payload, 1);
  return frame;
}

/**
 * Decode a y-websocket frame into type + payload.
 * Returns null if the frame is too short.
 */
export function decodeMessage(frame: Uint8Array): { type: MessageTypeValue; payload: Uint8Array } | null {
  if (frame.length < 1) return null;
  const type = frame[0] as MessageTypeValue;
  const payload = frame.slice(1);
  return { type, payload };
}

/**
 * Encode a Uint8Array to base64 for JSON transport over the relay.
 * Used when the relay expects JSON-wrapped binary (some public relays do).
 */
export function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}

/**
 * Decode base64 back to Uint8Array.
 */
export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

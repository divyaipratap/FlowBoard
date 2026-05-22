// FAB-15 — Public interface contract for @workspace/sync.
//
// OWNERSHIP:
//   - Track A (Claude) owns this file. Only A edits it.
//   - Track B (Codex) implements `PeerCipher` in ./crypto/.
//   - Track C (Kiro) implements `RelayTransport` in ./transport/.
//
// If you (B or C) need to widen these types, propose the diff in your PR
// rather than editing this file directly. Keeps the contract reviewable.

/** A symmetric room key derived from a pairing code. Opaque outside the crypto layer. */
export interface RoomKey {
  readonly __brand: "RoomKey";
}

/** A short, human-typeable pairing code. BIP39-style word list, fixed length. */
export interface PairingCode {
  readonly words: readonly string[];
}

/** A unique identifier for a sync room. 128-bit random, base32-encoded. Public; routed in clear. */
export type RoomId = string & { readonly __brand: "RoomId" };

/**
 * Cleartext routing wrapper around an encrypted payload.
 *
 * The relay sees this struct. It MUST NOT contain anything that leaks issue contents,
 * member identities, or anything beyond what's needed to route the message.
 */
export interface Envelope {
  readonly version: 1;
  /** Random per-message nonce. */
  readonly nonce: Uint8Array;
  /** AEAD ciphertext over a CRDT update. */
  readonly ciphertext: Uint8Array;
  /** Authentication tag. May be appended to ciphertext or separate depending on primitive. */
  readonly mac: Uint8Array;
}

/**
 * Crypto primitives. Implemented in ./crypto/ by Track B (Codex) using libsodium
 * (or @noble/ciphers if Codex picks that route — see crdt-choice.md / threat-model.md).
 *
 * Implementations MUST:
 *   - Use authenticated encryption (no unauthenticated ciphers).
 *   - Bind the room ID and a monotonic counter into the AAD to prevent cross-room replay.
 *   - Fail closed on MAC mismatch (throw, do not return partial plaintext).
 *   - Never log or persist plaintext or the room key outside the keystore.
 */
export interface PeerCipher {
  /**
   * Derive a long-lived room key from a pairing code and room ID.
   *
   * The room ID acts as a salt so two rooms with the same (unlikely) pairing code
   * produce different keys. Should be slow (Argon2id-class) — typed by humans, not machines.
   */
  deriveRoomKey(code: PairingCode, roomId: RoomId): Promise<RoomKey>;

  /**
   * Encrypt a CRDT update for a room. `aad` carries replay-protection state (sender ID,
   * counter) and is bound into the MAC. Caller (SyncEngine) is responsible for monotonicity.
   */
  encryptForRoom(key: RoomKey, plaintext: Uint8Array, aad: Uint8Array): Promise<Envelope>;

  /**
   * Decrypt an envelope. Throws on MAC failure, version mismatch, or AAD mismatch.
   */
  decryptFromRoom(key: RoomKey, envelope: Envelope, aad: Uint8Array): Promise<Uint8Array>;

  /**
   * Persist a room key in the OS keychain (Electron `safeStorage` or platform equivalent).
   * Returns an opaque storage handle (e.g. a key ID) that can be passed to `loadRoomKey`.
   */
  saveRoomKey(roomId: RoomId, key: RoomKey): Promise<string>;

  /**
   * Load a previously saved room key. Returns null if not found or unavailable
   * (e.g. keychain locked on first boot).
   */
  loadRoomKey(roomId: RoomId): Promise<RoomKey | null>;
}

/** Connection state observed by the renderer for the sync status indicator. */
export type TransportState = "idle" | "connecting" | "connected" | "disconnected" | "error";

/**
 * Relay transport. Implemented in ./transport/ by Track C (Kiro) speaking the
 * y-websocket wire protocol (see crdt-choice.md).
 *
 * Implementations MUST:
 *   - Never inspect, log, or modify the ciphertext field of an Envelope.
 *   - Reconnect with exponential backoff (cap 30s) on transient disconnect.
 *   - Buffer outbound messages while disconnected and replay on reconnect.
 *   - Expose state changes via `onStateChange` for the UI status indicator.
 */
export interface RelayTransport {
  connect(relayUrl: string, roomId: RoomId): Promise<void>;

  /** Enqueue an envelope to send. Returns immediately; delivery is best-effort + queued. */
  send(envelope: Envelope): void;

  /** Register a handler for incoming envelopes. Returns an unsubscribe function. */
  onMessage(handler: (envelope: Envelope) => void): () => void;

  /** Register a handler for connection state changes. Returns an unsubscribe function. */
  onStateChange(handler: (state: TransportState) => void): () => void;

  state(): TransportState;

  /** Number of messages waiting in the offline queue. UI uses this for the badge. */
  queuedCount(): number;

  disconnect(): Promise<void>;
}

/**
 * Pairing flow. Track A (Claude) owns this — it's the glue between PeerCipher and
 * the renderer. Exposed here so the Settings UI in artifacts/desktop/src/features/team-sync/
 * (Kiro) has stable types to depend on.
 */
export interface PairingService {
  /** Generate a new pairing code + room ID on the initiating device. */
  generate(): Promise<{ code: PairingCode; roomId: RoomId }>;

  /** Accept a pairing code typed in on the joining device. Returns the room ID after derivation. */
  accept(code: PairingCode): Promise<RoomId>;

  /** Codes expire after this many milliseconds. */
  readonly codeTtlMs: number;
}

/**
 * Engine surface exposed to the desktop server. Track A implements in ./engine.ts.
 * Kept narrow so the desktop server doesn't see Yjs internals.
 */
export interface SyncEngine {
  /** Start the engine for a room. Loads the room key, connects the transport, replays queued. */
  start(roomId: RoomId, relayUrl: string): Promise<void>;

  /** Stop the engine, disconnect transport, persist outstanding updates. */
  stop(): Promise<void>;

  /** Re-apply a local SQLite change (issue/comment/project) into the CRDT doc. */
  applyLocalChange(change: LocalChange): void;

  /** Current transport state, for the renderer. */
  state(): TransportState;
}

/**
 * Mirrors the desktop server's mutation events. Kept as a discriminated union so
 * the engine can route per-type without importing the server's schema.
 */
export type LocalChange =
  | { kind: "issue.upsert"; issueId: string; fields: Partial<IssueShadow> }
  | { kind: "issue.delete"; issueId: string }
  | { kind: "comment.create"; commentId: string; issueId: string; content: string; author: string }
  | { kind: "project.upsert"; projectId: string; fields: Partial<ProjectShadow> };

/** Mutable fields of an issue that participate in CRDT sync. See crdt-choice.md. */
export interface IssueShadow {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  assignee: string | null;
  labels: readonly string[];
}

/** Mutable fields of a project that participate in CRDT sync. */
export interface ProjectShadow {
  name: string;
  description: string | null;
  color: string;
}

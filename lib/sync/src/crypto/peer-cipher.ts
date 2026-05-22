import * as sodiumModule from "libsodium-wrappers-sumo";

import type { Envelope, PairingCode, PeerCipher, RoomId, RoomKey } from "../index.js";
import { ElectronSafeStorageRoomKeyStore, type RoomKeyStore } from "./key-store.js";
import { pairingCodeToPassphrase } from "./pairing-code.js";

type SodiumModule = typeof sodiumModule & { readonly default?: typeof sodiumModule };

const sodium = ((sodiumModule as SodiumModule).default ?? sodiumModule) as typeof sodiumModule;
const KEY_BYTES = 32;
const ROOM_KEY_BYTES = Symbol("FlowBoardRoomKeyBytes");
const KDF_DOMAIN = "flowboard-sync-room-key-v1";
const REPLAY_DOMAIN = "flowboard-sync-replay-v1";

type SodiumRoomKey = RoomKey & {
  readonly [ROOM_KEY_BYTES]: Uint8Array;
};

export interface Argon2idKdfParams {
  readonly opsLimit: number;
  readonly memLimit: number;
}

export interface PeerCipherOptions {
  readonly keyStore?: RoomKeyStore;
  readonly kdf?: Partial<Argon2idKdfParams>;
  readonly maxReplayEntries?: number;
}

export class PeerCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeerCipherError";
  }
}

export class ReplayDetectedError extends Error {
  constructor(message = "Replay detected for authenticated sync envelope") {
    super(message);
    this.name = "ReplayDetectedError";
  }
}

export function createPeerCipher(options: PeerCipherOptions = {}): PeerCipher {
  return new SodiumPeerCipher(options);
}

class SodiumPeerCipher implements PeerCipher {
  readonly #keyStore: RoomKeyStore;
  readonly #kdf: Partial<Argon2idKdfParams>;
  readonly #maxReplayEntries: number;
  readonly #seenAadByKey = new Map<string, string[]>();
  readonly #seenAadSetsByKey = new Map<string, Set<string>>();

  constructor(options: PeerCipherOptions) {
    this.#keyStore = options.keyStore ?? new ElectronSafeStorageRoomKeyStore();
    this.#kdf = options.kdf ?? {};
    this.#maxReplayEntries = options.maxReplayEntries ?? 4096;
  }

  async deriveRoomKey(code: PairingCode, roomId: RoomId): Promise<RoomKey> {
    await sodium.ready;

    const salt = sodium.crypto_generichash(
      sodium.crypto_pwhash_SALTBYTES,
      `${KDF_DOMAIN}:${roomId}`,
      null,
    );
    const keyBytes = sodium.crypto_pwhash(
      KEY_BYTES,
      pairingCodeToPassphrase(code),
      salt,
      this.#kdf.opsLimit ?? sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      this.#kdf.memLimit ?? sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    );

    return makeRoomKey(keyBytes);
  }

  async encryptForRoom(key: RoomKey, plaintext: Uint8Array, aad: Uint8Array): Promise<Envelope> {
    await sodium.ready;

    const keyBytes = unwrapRoomKey(key);
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt_detached(
      plaintext,
      aad,
      null,
      nonce,
      keyBytes,
    );

    return {
      version: 1,
      nonce,
      ciphertext: sealed.ciphertext,
      mac: sealed.mac,
    };
  }

  async decryptFromRoom(key: RoomKey, envelope: Envelope, aad: Uint8Array): Promise<Uint8Array> {
    await sodium.ready;

    if (envelope.version !== 1) {
      throw new PeerCipherError(`Unsupported envelope version: ${envelope.version}`);
    }

    const keyBytes = unwrapRoomKey(key);
    const replayKey = replayCacheKey(keyBytes);
    const aadTag = aadReplayTag(aad);
    if (this.#hasSeenAad(replayKey, aadTag)) {
      throw new ReplayDetectedError();
    }

    let plaintext: Uint8Array;
    try {
      plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt_detached(
        null,
        envelope.ciphertext,
        envelope.mac,
        aad,
        envelope.nonce,
        keyBytes,
      );
    } catch (error) {
      throw new PeerCipherError(`Envelope authentication failed: ${errorMessage(error)}`);
    }

    this.#markSeenAad(replayKey, aadTag);
    return plaintext;
  }

  async saveRoomKey(roomId: RoomId, key: RoomKey): Promise<string> {
    return this.#keyStore.save(roomId, unwrapRoomKey(key));
  }

  async loadRoomKey(roomId: RoomId): Promise<RoomKey | null> {
    const keyBytes = await this.#keyStore.load(roomId);
    return keyBytes === null ? null : makeRoomKey(keyBytes);
  }

  #hasSeenAad(replayKey: string, aadTag: string): boolean {
    return this.#seenAadSetsByKey.get(replayKey)?.has(aadTag) ?? false;
  }

  #markSeenAad(replayKey: string, aadTag: string): void {
    let aadSet = this.#seenAadSetsByKey.get(replayKey);
    let aadOrder = this.#seenAadByKey.get(replayKey);
    if (aadSet === undefined || aadOrder === undefined) {
      aadSet = new Set();
      aadOrder = [];
      this.#seenAadSetsByKey.set(replayKey, aadSet);
      this.#seenAadByKey.set(replayKey, aadOrder);
    }

    aadSet.add(aadTag);
    aadOrder.push(aadTag);

    while (aadOrder.length > this.#maxReplayEntries) {
      const evicted = aadOrder.shift();
      if (evicted !== undefined) {
        aadSet.delete(evicted);
      }
    }
  }
}

function makeRoomKey(keyBytes: Uint8Array): RoomKey {
  if (keyBytes.byteLength !== KEY_BYTES) {
    throw new PeerCipherError(`Room key must be ${KEY_BYTES} bytes`);
  }

  const key = { __brand: "RoomKey" } as SodiumRoomKey;
  Object.defineProperty(key, ROOM_KEY_BYTES, {
    enumerable: false,
    value: new Uint8Array(keyBytes),
  });

  return Object.freeze(key);
}

function unwrapRoomKey(key: RoomKey): Uint8Array {
  const maybeKey = key as Partial<SodiumRoomKey>;
  const keyBytes = maybeKey[ROOM_KEY_BYTES];
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== KEY_BYTES) {
    throw new PeerCipherError("Room key was not created by this PeerCipher implementation");
  }

  return new Uint8Array(keyBytes);
}

function replayCacheKey(keyBytes: Uint8Array): string {
  return sodium.to_base64(
    sodium.crypto_generichash(16, keyBytes, sodium.from_string(REPLAY_DOMAIN)),
    sodium.base64_variants.URLSAFE_NO_PADDING,
  );
}

function aadReplayTag(aad: Uint8Array): string {
  return sodium.to_base64(
    sodium.crypto_generichash(16, aad, sodium.from_string(REPLAY_DOMAIN)),
    sodium.base64_variants.URLSAFE_NO_PADDING,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

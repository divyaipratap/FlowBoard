import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import * as sodiumModule from "libsodium-wrappers-sumo";

import type { Envelope, PairingCode, RoomId } from "../index.js";
import {
  ElectronSafeStorageRoomKeyStore,
  InvalidPairingCodeError,
  ReplayDetectedError,
  createPeerCipher,
  generatePairingCode,
  normalizePairingCode,
  pairingCodeEntropyBits,
  type SafeStorageLike,
  type RoomKeyStore,
} from "./index.js";

type SodiumModule = typeof sodiumModule & { readonly default?: typeof sodiumModule };

const sodium = ((sodiumModule as SodiumModule).default ?? sodiumModule) as typeof sodiumModule;
const roomId = "fb_7y8k9m2p4q6r8t1v" as RoomId;
const code: PairingCode = {
  words: ["legal", "winner", "thank", "year", "wave", "sausage"],
};

test("pairing code generation returns six BIP39 words", async () => {
  const generated = await generatePairingCode();

  assert.equal(generated.words.length, 6);
  assert.equal(pairingCodeEntropyBits, 66);
  assert.deepEqual(normalizePairingCode(generated), generated);
});

test("pairing code validation rejects malformed codes", () => {
  assert.throws(
    () => normalizePairingCode({ words: ["legal", "winner", "thank"] }),
    InvalidPairingCodeError,
  );
  assert.throws(
    () => normalizePairingCode({ words: ["legal", "winner", "thank", "year", "wave", "nope"] }),
    InvalidPairingCodeError,
  );
});

test("room-key derivation is deterministic per code and room id", async () => {
  const cipher = fastCipher();
  const aad = new TextEncoder().encode("room=fb_7y8k9m2p4q6r8t1v;sender=a;counter=1");
  const plaintext = new TextEncoder().encode("yjs update");

  const keyA = await cipher.deriveRoomKey(code, roomId);
  const keyB = await cipher.deriveRoomKey(code, roomId);
  const envelope = await cipher.encryptForRoom(keyA, plaintext, aad);

  assert.deepEqual(await cipher.decryptFromRoom(keyB, envelope, aad), plaintext);
});

test("room id participates in key derivation", async () => {
  const cipher = fastCipher();
  const aad = new TextEncoder().encode("sender=a;counter=1");
  const plaintext = new TextEncoder().encode("same code, different room");
  const keyA = await cipher.deriveRoomKey(code, roomId);
  const keyB = await cipher.deriveRoomKey(code, "fb_other_room" as RoomId);
  const envelope = await cipher.encryptForRoom(keyA, plaintext, aad);

  await assert.rejects(() => cipher.decryptFromRoom(keyB, envelope, aad), /authentication failed/u);
});

test("AAD is authenticated and prevents cross-counter replay", async () => {
  const cipher = fastCipher();
  const key = await cipher.deriveRoomKey(code, roomId);
  const plaintext = new TextEncoder().encode("counter-bound update");
  const aad = new TextEncoder().encode("sender=a;counter=7");
  const wrongAad = new TextEncoder().encode("sender=a;counter=8");
  const envelope = await cipher.encryptForRoom(key, plaintext, aad);

  await assert.rejects(() => cipher.decryptFromRoom(key, envelope, wrongAad), /authentication failed/u);
  assert.deepEqual(await cipher.decryptFromRoom(key, envelope, aad), plaintext);
  await assert.rejects(() => cipher.decryptFromRoom(key, envelope, aad), ReplayDetectedError);
});

test("tampered ciphertext fails closed", async () => {
  const cipher = fastCipher();
  const key = await cipher.deriveRoomKey(code, roomId);
  const aad = new TextEncoder().encode("sender=a;counter=9");
  const envelope = await cipher.encryptForRoom(key, new TextEncoder().encode("secret"), aad);
  const tampered: Envelope = {
    ...envelope,
    ciphertext: new Uint8Array(envelope.ciphertext),
  };
  tampered.ciphertext[0] = tampered.ciphertext[0]! ^ 1;

  await assert.rejects(() => cipher.decryptFromRoom(key, tampered, aad), /authentication failed/u);
});

test("safeStorage keystore seals room keys outside JSON metadata", async () => {
  const storageDir = await mkdtemp(path.join(os.tmpdir(), "flowboard-sync-keys-"));
  try {
    const keyStore = new ElectronSafeStorageRoomKeyStore({
      safeStorage: xorSafeStorage(),
      storageDir,
    });
    const cipher = fastCipher(keyStore);
    const key = await cipher.deriveRoomKey(code, roomId);
    const handle = await cipher.saveRoomKey(roomId, key);
    const loaded = await cipher.loadRoomKey(roomId);
    assert.equal(handle, `safeStorage:${roomId}`);
    assert.ok(loaded);

    const aad = new TextEncoder().encode("sender=a;counter=10");
    const plaintext = new TextEncoder().encode("persisted key decrypts");
    const envelope = await cipher.encryptForRoom(key, plaintext, aad);
    assert.deepEqual(await cipher.decryptFromRoom(loaded, envelope, aad), plaintext);

    const stored = await readFile(path.join(storageDir, `${roomId}.json`), "utf8");
    assert.doesNotMatch(stored, /legal|winner|persisted key/u);
    assert.match(stored, /"sealed"/u);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

test("safeStorage load returns null when the OS keychain is unavailable", async () => {
  const keyStore = new ElectronSafeStorageRoomKeyStore({
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.alloc(0),
      decryptString: () => "",
    },
    storageDir: os.tmpdir(),
  });

  assert.equal(await keyStore.load(roomId), null);
});

function fastCipher(keyStore: RoomKeyStore = new MemoryRoomKeyStore()) {
  return createPeerCipher({
    keyStore,
    kdf: {
      opsLimit: sodium.crypto_pwhash_OPSLIMIT_MIN,
      memLimit: sodium.crypto_pwhash_MEMLIMIT_MIN,
    },
  });
}

class MemoryRoomKeyStore {
  readonly #keys = new Map<string, Uint8Array>();

  async save(roomId: RoomId, keyBytes: Uint8Array): Promise<string> {
    this.#keys.set(roomId, new Uint8Array(keyBytes));
    return `memory:${roomId}`;
  }

  async load(roomId: RoomId): Promise<Uint8Array | null> {
    const keyBytes = this.#keys.get(roomId);
    return keyBytes === undefined ? null : new Uint8Array(keyBytes);
  }
}

function xorSafeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => xor(Buffer.from(plaintext, "utf8")),
    decryptString: (encrypted: Buffer) => xor(encrypted).toString("utf8"),
  };
}

function xor(input: Buffer): Buffer {
  return Buffer.from(input.map((byte) => byte ^ 0xa7));
}

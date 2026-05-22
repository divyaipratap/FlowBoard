import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RoomId } from "../index.js";

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface RoomKeyStore {
  save(roomId: RoomId, keyBytes: Uint8Array): Promise<string>;
  load(roomId: RoomId): Promise<Uint8Array | null>;
}

export interface ElectronSafeStorageRoomKeyStoreOptions {
  readonly safeStorage?: SafeStorageLike;
  readonly storageDir?: string;
}

export class KeystoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeystoreUnavailableError";
  }
}

interface ElectronModule {
  readonly app?: {
    getPath(name: "userData"): string;
  };
  readonly safeStorage?: SafeStorageLike;
}

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<ElectronModule>;

export class ElectronSafeStorageRoomKeyStore implements RoomKeyStore {
  readonly #safeStorage: SafeStorageLike | undefined;
  readonly #storageDir: string | undefined;

  constructor(options: ElectronSafeStorageRoomKeyStoreOptions = {}) {
    this.#safeStorage = options.safeStorage;
    this.#storageDir = options.storageDir;
  }

  async save(roomId: RoomId, keyBytes: Uint8Array): Promise<string> {
    const safeStorage = await this.#resolveSafeStorage();
    if (!safeStorage.isEncryptionAvailable()) {
      throw new KeystoreUnavailableError("Electron safeStorage encryption is not available");
    }

    const storageDir = await this.#resolveStorageDir();
    await fs.mkdir(storageDir, { recursive: true });

    const payload = JSON.stringify({
      version: 1,
      roomId,
      key: Buffer.from(keyBytes).toString("base64"),
    });
    const sealed = safeStorage.encryptString(payload);
    const filePath = this.#filePath(storageDir, roomId);
    await fs.writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        roomId,
        sealed: sealed.toString("base64"),
      }),
      { mode: 0o600 },
    );

    return `safeStorage:${roomId}`;
  }

  async load(roomId: RoomId): Promise<Uint8Array | null> {
    const safeStorage = await this.#resolveSafeStorage();
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }

    const storageDir = await this.#resolveStorageDir();
    const filePath = this.#filePath(storageDir, roomId);
    let encoded: string;
    try {
      encoded = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    const stored = JSON.parse(encoded) as { version?: number; roomId?: string; sealed?: string };
    if (stored.version !== 1 || stored.roomId !== roomId || typeof stored.sealed !== "string") {
      throw new KeystoreUnavailableError("Stored room key metadata is invalid");
    }

    let decrypted: string;
    try {
      decrypted = safeStorage.decryptString(Buffer.from(stored.sealed, "base64"));
    } catch (error) {
      throw new KeystoreUnavailableError(`Stored room key could not be decrypted: ${errorMessage(error)}`);
    }

    const payload = JSON.parse(decrypted) as { version?: number; roomId?: string; key?: string };
    if (payload.version !== 1 || payload.roomId !== roomId || typeof payload.key !== "string") {
      throw new KeystoreUnavailableError("Stored room key payload is invalid");
    }

    return new Uint8Array(Buffer.from(payload.key, "base64"));
  }

  async #resolveSafeStorage(): Promise<SafeStorageLike> {
    if (this.#safeStorage !== undefined) {
      return this.#safeStorage;
    }

    const electron = await loadElectron();
    if (electron?.safeStorage === undefined) {
      throw new KeystoreUnavailableError("Electron safeStorage is not available in this process");
    }
    return electron.safeStorage;
  }

  async #resolveStorageDir(): Promise<string> {
    if (this.#storageDir !== undefined) {
      return this.#storageDir;
    }

    const electron = await loadElectron();
    const userData = electron?.app?.getPath("userData");
    if (userData !== undefined) {
      return path.join(userData, "sync-room-keys");
    }

    return path.join(os.homedir(), ".flowboard", "sync-room-keys");
  }

  #filePath(storageDir: string, roomId: RoomId): string {
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9._-]/gu, "_");
    return path.join(storageDir, `${safeRoomId}.json`);
  }
}

async function loadElectron(): Promise<ElectronModule | null> {
  try {
    return await dynamicImport("electron");
  } catch {
    return null;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

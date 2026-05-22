// FAB-15 — Cipher singleton for the desktop main process.
//
// Wraps Codex's PeerCipher (lib/sync/src/crypto) with Electron-specific bindings:
// - safeStorage comes from the Electron main process (this is where we run).
// - storageDir is rooted under app.getPath("userData") so keys stay with the app.
//
// The renderer NEVER imports this — keys never cross the process boundary.

import path from "node:path";
import {
  createPeerCipher,
  ElectronSafeStorageRoomKeyStore,
  type RoomKeyStore,
} from "@workspace/sync/crypto";
import type { PeerCipher } from "@workspace/sync";

let cipher: PeerCipher | null = null;

function resolveElectronBindings(): { safeStorage: Electron.SafeStorage; userData: string } | null {
  try {
    const electron = require("electron") as typeof import("electron");
    if (!electron.safeStorage || !electron.app) return null;
    return { safeStorage: electron.safeStorage, userData: electron.app.getPath("userData") };
  } catch {
    return null;
  }
}

function buildKeyStore(): RoomKeyStore {
  const bindings = resolveElectronBindings();
  if (!bindings) {
    return new ElectronSafeStorageRoomKeyStore();
  }
  return new ElectronSafeStorageRoomKeyStore({
    safeStorage: bindings.safeStorage,
    storageDir: path.join(bindings.userData, "sync-room-keys"),
  });
}

export function getPeerCipher(): PeerCipher {
  if (cipher) return cipher;
  cipher = createPeerCipher({ keyStore: buildKeyStore() });
  return cipher;
}

export function isKeychainAvailable(): boolean {
  const bindings = resolveElectronBindings();
  if (!bindings) return false;
  try {
    return bindings.safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

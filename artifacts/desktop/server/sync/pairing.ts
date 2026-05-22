// FAB-15 — Pairing service.
//
// Flow:
//   Initiator (A):  POST /api/sync/pairing/generate  → { roomId, words, relayUrl }
//                   server creates a Y.Doc room, derives the key in-process, persists
//                   the key under safeStorage, and stashes the pairing code in memory
//                   with a TTL so the same words can be typed back during accept().
//
//   Joiner (B):     POST /api/sync/pairing/accept    body: { roomId, words, relayUrl }
//                   server derives the same key (same code + roomId), persists, returns.
//
// The relay URL stays optional on the wire — we default to the platform default if
// the renderer hasn't picked one.

import { randomBytes } from "node:crypto";
import {
  generatePairingCode,
  InvalidPairingCodeError,
  normalizePairingCode,
} from "@workspace/sync/crypto";
import type { PairingCode, RoomId } from "@workspace/sync";
import { getPeerCipher, isKeychainAvailable } from "./cipher";
import { insertRoom, type SyncRoomRecord } from "./rooms";

export class KeychainUnavailableError extends Error {
  constructor() {
    super("OS keychain is unavailable — cannot persist room keys");
    this.name = "KeychainUnavailableError";
  }
}

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PendingCode {
  code: PairingCode;
  roomId: RoomId;
  relayUrl: string;
  expiresAt: number;
}

// Track pending codes the initiator has issued but the joiner hasn't accepted yet.
// They expire — the joiner has 10 minutes to type the code on their device.
const pendingByRoomId = new Map<string, PendingCode>();

function purgeExpired(now: number = Date.now()): void {
  for (const [roomId, pending] of pendingByRoomId) {
    if (pending.expiresAt < now) pendingByRoomId.delete(roomId);
  }
}

function newRoomId(): RoomId {
  // 128 bits, URL-safe-ish.  Prefix "fb_" so it's recognizable in relay logs.
  return `fb_${randomBytes(16).toString("hex")}` as RoomId;
}

export interface GenerateResult {
  roomId: RoomId;
  words: readonly string[];
  relayUrl: string;
  expiresAt: string;
}

export async function generate(input: {
  relayUrl: string;
  label?: string | null;
}): Promise<GenerateResult> {
  if (!isKeychainAvailable()) {
    throw new KeychainUnavailableError();
  }

  purgeExpired();

  const code = await generatePairingCode();
  const roomId = newRoomId();
  const cipher = getPeerCipher();
  const key = await cipher.deriveRoomKey(code, roomId);
  const keychainRef = await cipher.saveRoomKey(roomId, key);

  await insertRoom({
    id: roomId,
    label: input.label ?? null,
    relayUrl: input.relayUrl,
    keychainRef,
  });

  const expiresAt = Date.now() + PAIRING_CODE_TTL_MS;
  pendingByRoomId.set(roomId, { code, roomId, relayUrl: input.relayUrl, expiresAt });

  return {
    roomId,
    words: code.words,
    relayUrl: input.relayUrl,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export interface AcceptInput {
  roomId: string;
  words: readonly string[];
  relayUrl: string;
  label?: string | null;
}

export interface AcceptResult {
  roomId: RoomId;
  room: SyncRoomRecord;
}

export async function accept(input: AcceptInput): Promise<AcceptResult> {
  if (!isKeychainAvailable()) {
    throw new KeychainUnavailableError();
  }

  const normalized = normalizePairingCode({ words: [...input.words] });
  const roomId = input.roomId as RoomId;

  const cipher = getPeerCipher();
  const key = await cipher.deriveRoomKey(normalized, roomId);
  const keychainRef = await cipher.saveRoomKey(roomId, key);

  const room = await insertRoom({
    id: roomId,
    label: input.label ?? null,
    relayUrl: input.relayUrl,
    keychainRef,
  });

  return { roomId, room };
}

export function getPendingForRoom(roomId: string): PendingCode | null {
  purgeExpired();
  return pendingByRoomId.get(roomId) ?? null;
}

export function clearPending(roomId: string): void {
  pendingByRoomId.delete(roomId);
}

export { InvalidPairingCodeError };

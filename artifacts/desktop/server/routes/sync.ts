// FAB-15 — Sync HTTP routes.
//
// Endpoints (all under /api):
//   GET    /sync/state                 — keychain availability + room count
//   GET    /sync/rooms                 — list paired rooms (no secrets)
//   DELETE /sync/rooms/:id             — remove a room (key stays in keychain — TODO purge)
//   PATCH  /sync/rooms/:id             — toggle enabled, change relay URL
//   POST   /sync/pairing/generate      — initiator: { roomId, words[], relayUrl }
//   POST   /sync/pairing/accept        — joiner: derives same key, persists room
//   POST   /sync/resolve-conflict      — apply chosen status to an issue

import { Router, type IRouter } from "express";
import { InvalidPairingCodeError } from "@workspace/sync/crypto";
import {
  accept,
  clearPending,
  generate,
  KeychainUnavailableError,
} from "../sync/pairing";
import {
  deleteRoom,
  getRoom,
  listRooms,
  setRoomEnabled,
  setRoomRelayUrl,
  toPublic,
} from "../sync/rooms";
import { isKeychainAvailable } from "../sync/cipher";
import { resolveStatusConflict } from "../sync/conflicts";

const DEFAULT_RELAY_URL = "wss://y-websocket-relay.fly.dev";

const router: IRouter = Router();

router.get("/sync/state", async (_req, res) => {
  const rooms = await listRooms();
  res.json({
    keychainAvailable: isKeychainAvailable(),
    roomCount: rooms.length,
    defaultRelayUrl: DEFAULT_RELAY_URL,
  });
});

router.get("/sync/rooms", async (_req, res) => {
  res.json(await listRooms());
});

router.post("/sync/pairing/generate", async (req, res) => {
  try {
    const body = req.body as { relayUrl?: string; label?: string | null } | undefined;
    const relayUrl = (body?.relayUrl ?? "").trim() || DEFAULT_RELAY_URL;
    const result = await generate({ relayUrl, label: body?.label ?? null });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof KeychainUnavailableError) {
      res.status(503).json({ error: error.message, code: "KEYCHAIN_UNAVAILABLE" });
      return;
    }
    res.status(500).json({ error: errorMessage(error) });
  }
});

router.post("/sync/pairing/accept", async (req, res) => {
  try {
    const body = req.body as {
      roomId?: string;
      words?: readonly string[];
      relayUrl?: string;
      label?: string | null;
    } | undefined;
    if (!body?.roomId || !Array.isArray(body.words)) {
      res.status(400).json({ error: "roomId and words[] are required" });
      return;
    }
    const result = await accept({
      roomId: body.roomId,
      words: body.words,
      relayUrl: (body.relayUrl ?? "").trim() || DEFAULT_RELAY_URL,
      label: body.label ?? null,
    });
    clearPending(result.roomId);
    res.status(201).json({ roomId: result.roomId, room: toPublic(result.room) });
  } catch (error) {
    if (error instanceof InvalidPairingCodeError) {
      res.status(400).json({ error: error.message, code: "INVALID_PAIRING_CODE" });
      return;
    }
    if (error instanceof KeychainUnavailableError) {
      res.status(503).json({ error: error.message, code: "KEYCHAIN_UNAVAILABLE" });
      return;
    }
    res.status(500).json({ error: errorMessage(error) });
  }
});

router.patch("/sync/rooms/:id", async (req, res) => {
  const id = req.params.id;
  const body = req.body as { enabled?: boolean; relayUrl?: string } | undefined;

  let row = await getRoom(id);
  if (!row) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (typeof body?.enabled === "boolean") {
    row = (await setRoomEnabled(id, body.enabled)) ?? row;
  }
  if (typeof body?.relayUrl === "string" && body.relayUrl.trim().length > 0) {
    row = (await setRoomRelayUrl(id, body.relayUrl.trim())) ?? row;
  }

  res.json(toPublic(row));
});

router.delete("/sync/rooms/:id", async (req, res) => {
  const removed = await deleteRoom(req.params.id);
  if (!removed) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.status(204).send();
});

router.post("/sync/resolve-conflict", async (req, res) => {
  const body = req.body as { issueId?: string; chosenStatus?: string } | undefined;
  if (!body?.issueId || typeof body.chosenStatus !== "string") {
    res.status(400).json({ error: "issueId and chosenStatus are required" });
    return;
  }
  const result = await resolveStatusConflict({
    issueId: body.issueId,
    chosenStatus: body.chosenStatus,
  });
  if (!result) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  res.json(result);
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default router;

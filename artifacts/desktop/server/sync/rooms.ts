// FAB-15 — Rooms DAL.
//
// A "room" is a paired set of devices sharing one encrypted Y.Doc.
// The renderer never sees the key — only the public room ID + relay URL + label.

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { syncRoomsTable } from "../schema";

export interface SyncRoomRecord {
  id: string;
  label: string | null;
  relayUrl: string;
  keychainRef: string;
  enabled: boolean;
  createdAt: Date;
  lastConnectedAt: Date | null;
}

export interface PublicSyncRoom {
  id: string;
  label: string | null;
  relayUrl: string;
  enabled: boolean;
  createdAt: string;
  lastConnectedAt: string | null;
}

export function toPublic(row: SyncRoomRecord): PublicSyncRoom {
  return {
    id: row.id,
    label: row.label,
    relayUrl: row.relayUrl,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
  };
}

export async function listRooms(): Promise<PublicSyncRoom[]> {
  const rows = await getDb().select().from(syncRoomsTable).orderBy(syncRoomsTable.createdAt);
  return rows.map(toPublic);
}

export async function getRoom(id: string): Promise<SyncRoomRecord | null> {
  const [row] = await getDb().select().from(syncRoomsTable).where(eq(syncRoomsTable.id, id));
  return row ?? null;
}

export async function insertRoom(input: {
  id: string;
  label?: string | null;
  relayUrl: string;
  keychainRef: string;
}): Promise<SyncRoomRecord> {
  const [row] = await getDb()
    .insert(syncRoomsTable)
    .values({
      id: input.id,
      label: input.label ?? null,
      relayUrl: input.relayUrl,
      keychainRef: input.keychainRef,
      enabled: true,
    })
    .returning();
  return row;
}

export async function setRoomEnabled(id: string, enabled: boolean): Promise<SyncRoomRecord | null> {
  const [row] = await getDb()
    .update(syncRoomsTable)
    .set({ enabled })
    .where(eq(syncRoomsTable.id, id))
    .returning();
  return row ?? null;
}

export async function setRoomRelayUrl(id: string, relayUrl: string): Promise<SyncRoomRecord | null> {
  const [row] = await getDb()
    .update(syncRoomsTable)
    .set({ relayUrl })
    .where(eq(syncRoomsTable.id, id))
    .returning();
  return row ?? null;
}

export async function touchConnected(id: string): Promise<void> {
  await getDb()
    .update(syncRoomsTable)
    .set({ lastConnectedAt: new Date() })
    .where(eq(syncRoomsTable.id, id));
}

export async function deleteRoom(id: string): Promise<boolean> {
  const result = await getDb().delete(syncRoomsTable).where(eq(syncRoomsTable.id, id)).returning();
  return result.length > 0;
}

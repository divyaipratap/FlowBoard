// FAB-12 — Field-write tracking for conflict policy.
//
// Whenever an agent writes a tracked field on an issue, we record:
//   (issueId, fieldName) -> { lastWriterAgentName, lastWriterRole, value, updatedAt }
//
// On the next write attempt to the same (issueId, fieldName) by a *different*
// agent, the orchestration layer forces a proposal even if the bridge is in
// trusted mode. The user resolves it explicitly. This is the "second writer
// must open a proposal" half of the FAB-12 conflict policy.
//
// Race window: configurable, defaults to 60 seconds. Outside the window we
// assume the previous writer "released" the field and let the new writer
// proceed under normal rules.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { issueFieldWritesTable } from "../schema";
import type { Role, TrackedField } from "./roles";

const DEFAULT_CONFLICT_WINDOW_MS = 60_000;

export interface FieldWriteRecord {
  issueId: string;
  fieldName: TrackedField;
  lastWriterAgentName: string | null;
  lastWriterRole: Role | null;
  lastValue: string | null;
  updatedAt: Date;
}

function normalize(row: typeof issueFieldWritesTable.$inferSelect): FieldWriteRecord {
  return {
    issueId: row.issueId,
    fieldName: row.fieldName as TrackedField,
    lastWriterAgentName: row.lastWriterAgentName,
    lastWriterRole: row.lastWriterRole as Role | null,
    lastValue: row.lastValue,
    updatedAt: row.updatedAt,
  };
}

export async function getFieldWrite(issueId: string, fieldName: TrackedField): Promise<FieldWriteRecord | null> {
  const [row] = await getDb()
    .select()
    .from(issueFieldWritesTable)
    .where(and(eq(issueFieldWritesTable.issueId, issueId), eq(issueFieldWritesTable.fieldName, fieldName)));
  return row ? normalize(row) : null;
}

export async function recordFieldWrite(input: {
  issueId: string;
  fieldName: TrackedField;
  agentName: string;
  role: Role | null;
  value: string | null;
}): Promise<FieldWriteRecord> {
  const db = getDb();
  const existing = await getFieldWrite(input.issueId, input.fieldName);
  if (existing) {
    const [row] = await db
      .update(issueFieldWritesTable)
      .set({
        lastWriterAgentName: input.agentName,
        lastWriterRole: input.role,
        lastValue: input.value,
        updatedAt: new Date(),
      })
      .where(and(eq(issueFieldWritesTable.issueId, input.issueId), eq(issueFieldWritesTable.fieldName, input.fieldName)))
      .returning();
    return normalize(row);
  }

  const [row] = await db
    .insert(issueFieldWritesTable)
    .values({
      id: randomUUID(),
      issueId: input.issueId,
      fieldName: input.fieldName,
      lastWriterAgentName: input.agentName,
      lastWriterRole: input.role ?? null,
      lastValue: input.value,
    })
    .returning();
  return normalize(row);
}

/**
 * Conflict check: does this writer collide with a recent write by a
 * *different* agent? Returns the conflicting record if so, else null.
 */
export async function detectFieldConflict(opts: {
  issueId: string;
  fieldName: TrackedField;
  agentName: string;
  windowMs?: number;
}): Promise<FieldWriteRecord | null> {
  const windowMs = opts.windowMs ?? DEFAULT_CONFLICT_WINDOW_MS;
  const existing = await getFieldWrite(opts.issueId, opts.fieldName);
  if (!existing) return null;
  if (existing.lastWriterAgentName === opts.agentName) return null;
  if (Date.now() - existing.updatedAt.getTime() > windowMs) return null;
  return existing;
}

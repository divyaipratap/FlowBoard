// FAB-15 — Status conflict resolution.
//
// Called by the StatusConflictDialog when the user picks "mine" or "theirs".
// The dialog already has both candidate statuses in hand — the server just needs
// to apply the chosen one to the issues row, broadcast it to peers via the CRDT
// doc, and emit issue.updated so the rest of the UI repaints.

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { issuesTable } from "../schema";
import { emitFlowBoardEvent } from "../events";
import { getSyncEngineManager } from "./engine";

export interface ResolveConflictInput {
  issueId: string;
  chosenStatus: string;
}

export interface ResolveConflictResult {
  issueId: string;
  status: string;
  updatedAt: string;
}

export async function resolveStatusConflict(input: ResolveConflictInput): Promise<ResolveConflictResult | null> {
  const now = new Date();
  const [row] = await getDb()
    .update(issuesTable)
    .set({ status: input.chosenStatus, updatedAt: now })
    .where(eq(issuesTable.id, input.issueId))
    .returning();

  if (!row) return null;

  emitFlowBoardEvent({
    type: "issue.updated",
    issueId: row.id,
    projectId: row.projectId,
    status: row.status,
  });

  // Broadcast the resolution to peers so the other side converges.
  getSyncEngineManager().applyLocalChange({
    kind: "issue.upsert",
    issueId: row.id,
    fields: { status: row.status },
  });

  return { issueId: row.id, status: row.status, updatedAt: now.toISOString() };
}

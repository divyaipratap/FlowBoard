// FAB-15 — Status conflict resolution.
//
// Called by the StatusConflictDialog when the user picks "mine" or "theirs".
// The dialog already has both candidate statuses in hand — the server just needs
// to apply the chosen one to the issues row and emit issue.updated so the rest
// of the UI repaints.
//
// Once SyncEngine lands, this will also broadcast the resolution to peers via
// the CRDT doc.  For now it's a local-only write.

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { issuesTable } from "../schema";
import { emitFlowBoardEvent } from "../events";

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

  return { issueId: row.id, status: row.status, updatedAt: now.toISOString() };
}

// FAB-12 — Role assignments DAL + handoff state machine.

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { issueRoleAssignmentsTable, issuesTable } from "../schema";
import { emitFlowBoardEvent } from "../events";
import { latestGreenWorkProofForIssue } from "../workProof";
import { HANDOFF_ORDER, type Role, type RoleStatus, isRole, isRoleStatus } from "./roles";

export interface RoleAssignment {
  id: string;
  issueId: string;
  projectId: string;
  agentName: string;
  role: Role;
  status: RoleStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

function normalize(row: typeof issueRoleAssignmentsTable.$inferSelect): RoleAssignment {
  return {
    id: row.id,
    issueId: row.issueId,
    projectId: row.projectId,
    agentName: row.agentName,
    role: row.role as Role,
    status: row.status as RoleStatus,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export async function listAssignmentsForIssue(issueId: string): Promise<RoleAssignment[]> {
  const rows = await getDb()
    .select()
    .from(issueRoleAssignmentsTable)
    .where(eq(issueRoleAssignmentsTable.issueId, issueId))
    .orderBy(asc(issueRoleAssignmentsTable.createdAt));
  return rows.map(normalize);
}

export async function listAssignmentsForIssues(issueIds: readonly string[]): Promise<Map<string, RoleAssignment[]>> {
  if (issueIds.length === 0) return new Map();
  const rows = await getDb()
    .select()
    .from(issueRoleAssignmentsTable)
    .where(inArray(issueRoleAssignmentsTable.issueId, issueIds as string[]));
  const out = new Map<string, RoleAssignment[]>();
  for (const row of rows) {
    const existing = out.get(row.issueId) ?? [];
    existing.push(normalize(row));
    out.set(row.issueId, existing);
  }
  return out;
}

export async function findAssignment(issueId: string, agentName: string, role: Role): Promise<RoleAssignment | null> {
  const [row] = await getDb()
    .select()
    .from(issueRoleAssignmentsTable)
    .where(
      and(
        eq(issueRoleAssignmentsTable.issueId, issueId),
        eq(issueRoleAssignmentsTable.agentName, agentName),
        eq(issueRoleAssignmentsTable.role, role),
      ),
    );
  return row ? normalize(row) : null;
}

export async function findAssignmentsByAgent(agentName: string): Promise<RoleAssignment[]> {
  const rows = await getDb()
    .select()
    .from(issueRoleAssignmentsTable)
    .where(eq(issueRoleAssignmentsTable.agentName, agentName))
    .orderBy(desc(issueRoleAssignmentsTable.updatedAt));
  return rows.map(normalize);
}

export async function findAssignmentsForAgentOnIssue(issueId: string, agentName: string): Promise<RoleAssignment[]> {
  const rows = await getDb()
    .select()
    .from(issueRoleAssignmentsTable)
    .where(
      and(
        eq(issueRoleAssignmentsTable.issueId, issueId),
        eq(issueRoleAssignmentsTable.agentName, agentName),
      ),
    );
  return rows.map(normalize);
}

export async function createAssignment(input: {
  issueId: string;
  agentName: string;
  role: Role;
  status?: RoleStatus;
  notes?: string | null;
}): Promise<RoleAssignment> {
  const db = getDb();
  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, input.issueId));
  if (!issue) throw new Error("Issue not found");

  // Idempotent: if (issue, agent, role) already exists, return it.
  const existing = await findAssignment(input.issueId, input.agentName, input.role);
  if (existing) return existing;

  const status: RoleStatus = input.status ?? (input.role === "implementer" ? "ready" : "pending");
  const [row] = await db
    .insert(issueRoleAssignmentsTable)
    .values({
      id: randomUUID(),
      issueId: input.issueId,
      projectId: issue.projectId,
      agentName: input.agentName,
      role: input.role,
      status,
      notes: input.notes ?? null,
    })
    .returning();
  emitFlowBoardEvent({ type: "issue.updated", issueId: row.issueId, projectId: row.projectId, status: issue.status });
  return normalize(row);
}

export async function updateAssignmentStatus(
  id: string,
  status: RoleStatus,
  notes?: string | null,
): Promise<RoleAssignment | null> {
  if (!isRoleStatus(status)) throw new Error(`Invalid role status: ${status}`);
  const patch: Record<string, unknown> = { status, updatedAt: new Date() };
  if (notes !== undefined) patch.notes = notes;
  if (status === "done" || status === "rejected") patch.completedAt = new Date();

  const [row] = await getDb()
    .update(issueRoleAssignmentsTable)
    .set(patch as never)
    .where(eq(issueRoleAssignmentsTable.id, id))
    .returning();
  if (!row) return null;
  emitFlowBoardEvent({ type: "issue.updated", issueId: row.issueId, projectId: row.projectId });
  return normalize(row);
}

export async function deleteAssignment(id: string): Promise<boolean> {
  const result = await getDb()
    .delete(issueRoleAssignmentsTable)
    .where(eq(issueRoleAssignmentsTable.id, id))
    .returning();
  if (result[0]) emitFlowBoardEvent({ type: "issue.updated", issueId: result[0].issueId, projectId: result[0].projectId });
  return result.length > 0;
}

/**
 * Advance the handoff after one role finishes. Strategy:
 *
 *   1. Mark the just-finished assignment as `done` (or `rejected` if `pass=false`).
 *   2. If pass=false, stop — the chain is broken and the user must intervene.
 *   3. Otherwise, find the next role in HANDOFF_ORDER that has an assignment
 *      on this issue and is currently `pending` or `ready`, and mark it `ready`.
 *   4. If no later role exists, AND every assignment on the issue is `done`,
 *      AND the latest WorkProof for the issue is green, return
 *      `{ readyToAutoComplete: true }` so the caller can ask Agent Bridge to
 *      mark the issue done (subject to existing rules).
 */
export interface HandoffResult {
  finishedAssignment: RoleAssignment;
  nextAssignment: RoleAssignment | null;
  readyToAutoComplete: boolean;
}

export async function advanceHandoff(opts: {
  assignmentId: string;
  pass: boolean;
  notes?: string | null;
}): Promise<HandoffResult> {
  const finished = await updateAssignmentStatus(
    opts.assignmentId,
    opts.pass ? "done" : "rejected",
    opts.notes ?? null,
  );
  if (!finished) throw new Error("Assignment not found");

  if (!opts.pass) {
    return { finishedAssignment: finished, nextAssignment: null, readyToAutoComplete: false };
  }

  const all = await listAssignmentsForIssue(finished.issueId);
  const finishedRoleIdx = HANDOFF_ORDER.indexOf(finished.role);

  let nextAssignment: RoleAssignment | null = null;
  if (finishedRoleIdx >= 0) {
    for (let i = finishedRoleIdx + 1; i < HANDOFF_ORDER.length; i++) {
      const candidate = all.find((a) => a.role === HANDOFF_ORDER[i] && (a.status === "pending" || a.status === "ready"));
      if (candidate) {
        if (candidate.status !== "ready") {
          nextAssignment = await updateAssignmentStatus(candidate.id, "ready", null);
        } else {
          nextAssignment = candidate;
        }
        break;
      }
    }
  }

  let readyToAutoComplete = false;
  if (!nextAssignment) {
    const allDone = all.length > 0 && all.every((a) => a.status === "done");
    if (allDone) {
      const greenProof = await latestGreenWorkProofForIssue(finished.issueId);
      readyToAutoComplete = !!greenProof;
    }
  }

  return { finishedAssignment: finished, nextAssignment, readyToAutoComplete };
}

/**
 * Find the active role for an agent on an issue, if any. "Active" means
 * the assignment is in `ready` or `in_progress` state.
 *
 * The MCP tool layer uses this to apply the per-role allowlist when an agent
 * acts on an issue — without an active assignment, the agent falls back to
 * the standard Agent Bridge permission set (no role narrowing).
 */
export async function activeRoleFor(issueId: string, agentName: string): Promise<Role | null> {
  const rows = await findAssignmentsForAgentOnIssue(issueId, agentName);
  const active = rows.find((r) => r.status === "ready" || r.status === "in_progress");
  if (active) return active.role;
  return null;
}

export { isRole };

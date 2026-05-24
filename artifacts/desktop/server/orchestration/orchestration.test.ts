// FAB-12 — Orchestration tests.
//
// Covers:
//   1. createAssignment + listAssignmentsForIssue
//   2. activeRoleFor returns null when no assignment, role when ready/in_progress
//   3. gateToolCall: role narrowing rejects forbidden tools
//   4. gateToolCall: field conflict forces a proposal
//   5. advanceHandoff promotes the next role's status
//   6. advanceHandoff readyToAutoComplete when all done + green WorkProof
//   7. recordFieldWrite + detectFieldConflict outside the window

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initDb, getDb } from "../db";
import { issuesTable, projectsTable, agentWorkProofsTable, agentWorklogEntriesTable } from "../schema";
import {
  createAssignment,
  activeRoleFor,
  advanceHandoff,
  listAssignmentsForIssue,
} from "./assignments";
import { gateToolCall } from "./gate";
import { recordFieldWrite, detectFieldConflict } from "./fieldWrites";

const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "flowboard-orchestration-")), "test.db");
initDb(dbPath);

let issueCounter = 0;
async function seedIssue(prefix: string, status = "todo"): Promise<{ projectId: string; issueId: string }> {
  const db = getDb();
  issueCounter++;
  const projectId = `project-${prefix}-${issueCounter}`;
  const issueId = `issue-${prefix}-${issueCounter}`;
  await db.insert(projectsTable).values({
    id: projectId,
    name: prefix,
    key: `P${issueCounter}`,
    description: null,
    color: "#fff",
  }).onConflictDoNothing();
  await db.insert(issuesTable).values({
    id: issueId,
    projectId,
    issueNumber: 1,
    title: "T",
    description: null,
    status,
    priority: "medium",
    type: "task",
    assignee: null,
    reporter: "tester",
    labels: "[]",
  });
  return { projectId, issueId };
}

test("createAssignment is idempotent and returns existing rows", async () => {
  const { issueId } = await seedIssue("idem");
  const a = await createAssignment({ issueId, agentName: "Codex", role: "implementer" });
  const b = await createAssignment({ issueId, agentName: "Codex", role: "implementer" });
  assert.equal(a.id, b.id);
  const list = await listAssignmentsForIssue(issueId);
  assert.equal(list.length, 1);
});

test("activeRoleFor returns the role for ready/in_progress assignments only", async () => {
  const { issueId } = await seedIssue("active");
  await createAssignment({ issueId, agentName: "Codex", role: "implementer" }); // implementer defaults to ready
  await createAssignment({ issueId, agentName: "Claude", role: "reviewer" });   // defaults to pending
  const codexRole = await activeRoleFor(issueId, "Codex");
  const claudeRole = await activeRoleFor(issueId, "Claude");
  assert.equal(codexRole, "implementer");
  assert.equal(claudeRole, null); // pending != active
});

test("gateToolCall denies a reviewer trying to update status", async () => {
  const { issueId } = await seedIssue("rev");
  await createAssignment({ issueId, agentName: "Claude", role: "reviewer" });
  // Reviewer needs to be active for the gate to apply.
  const list = await listAssignmentsForIssue(issueId);
  const { updateAssignmentStatus } = await import("./assignments");
  await updateAssignmentStatus(list[0].id, "ready", null);

  const outcome = await gateToolCall({
    agentName: "Claude",
    toolName: "flowboard_update_issue_status",
    issueId,
  });
  assert.equal(outcome.kind, "deny");
});

test("gateToolCall allows an implementer to update status (no conflict)", async () => {
  const { issueId } = await seedIssue("impl");
  await createAssignment({ issueId, agentName: "Codex", role: "implementer" });

  const outcome = await gateToolCall({
    agentName: "Codex",
    toolName: "flowboard_update_issue_status",
    issueId,
    fieldsToWrite: ["status"],
  });
  assert.equal(outcome.kind, "allow");
});

test("recordFieldWrite + detectFieldConflict surfaces a recent foreign write", async () => {
  const { issueId } = await seedIssue("conflict");
  await recordFieldWrite({ issueId, fieldName: "status", agentName: "Codex", role: "implementer", value: "in_progress" });
  // Same agent — no conflict.
  const sameAgent = await detectFieldConflict({ issueId, fieldName: "status", agentName: "Codex" });
  assert.equal(sameAgent, null);
  // Different agent within window — conflict.
  const otherAgent = await detectFieldConflict({ issueId, fieldName: "status", agentName: "Claude" });
  assert.ok(otherAgent);
  assert.equal(otherAgent!.lastWriterAgentName, "Codex");
});

test("detectFieldConflict ignores writes outside the configured window", async () => {
  const { issueId } = await seedIssue("window");
  await recordFieldWrite({ issueId, fieldName: "status", agentName: "Codex", role: "implementer", value: "in_progress" });
  // Look back through a window of 0ms (never within window).
  const result = await detectFieldConflict({ issueId, fieldName: "status", agentName: "Claude", windowMs: 0 });
  assert.equal(result, null);
});

test("gateToolCall forces a proposal when a foreign agent recently wrote the same field", async () => {
  const { issueId } = await seedIssue("force");
  await createAssignment({ issueId, agentName: "Codex", role: "implementer" });
  // Codex wrote status. Now Claude tries to update it via the bridge.
  await recordFieldWrite({ issueId, fieldName: "status", agentName: "Codex", role: "implementer", value: "in_progress" });
  const outcome = await gateToolCall({
    agentName: "Claude",
    toolName: "flowboard_update_issue_status",
    issueId,
    fieldsToWrite: ["status"],
  });
  // No active role for Claude on this issue → role narrowing doesn't apply,
  // BUT the field-conflict check still triggers.
  assert.equal(outcome.kind, "force-proposal");
  if (outcome.kind === "force-proposal") {
    assert.equal(outcome.conflict.lastWriterAgentName, "Codex");
  }
});

test("advanceHandoff marks finished done and promotes next role to ready", async () => {
  const { issueId } = await seedIssue("handoff");
  const impl = await createAssignment({ issueId, agentName: "Codex", role: "implementer" });
  await createAssignment({ issueId, agentName: "Claude", role: "reviewer" });
  await createAssignment({ issueId, agentName: "Ollama", role: "tester" });

  const result = await advanceHandoff({ assignmentId: impl.id, pass: true });
  assert.equal(result.finishedAssignment.status, "done");
  assert.ok(result.nextAssignment);
  assert.equal(result.nextAssignment!.role, "reviewer");
  assert.equal(result.nextAssignment!.status, "ready");
  assert.equal(result.readyToAutoComplete, false);
});

test("advanceHandoff readyToAutoComplete when all roles done and a green WorkProof exists", async () => {
  const { issueId, projectId } = await seedIssue("autocomplete");
  const a = await createAssignment({ issueId, agentName: "Codex", role: "implementer" });

  // Seed a worklog + green WorkProof so latestGreenWorkProofForIssue returns truthy.
  const db = getDb();
  await db.insert(agentWorklogEntriesTable).values({
    id: "worklog-auto",
    issueId,
    projectId,
    agentName: "Codex",
    summary: "done",
  });
  await db.insert(agentWorkProofsTable).values({
    id: "wp-auto",
    worklogId: "worklog-auto",
    issueId,
    projectId,
    agentName: "Codex",
    filesChanged: "[]",
    commandResults: "[]",
    checks: '{"tests":"pass"}',
    environment: "{}",
    verdict: "green",
    chainIndex: 0,
    proofHash: "abc",
  });

  const result = await advanceHandoff({ assignmentId: a.id, pass: true });
  assert.equal(result.readyToAutoComplete, true);
});

test("advanceHandoff with pass=false stops the chain", async () => {
  const { issueId } = await seedIssue("stop");
  const a = await createAssignment({ issueId, agentName: "Codex", role: "implementer" });
  await createAssignment({ issueId, agentName: "Claude", role: "reviewer" });
  const result = await advanceHandoff({ assignmentId: a.id, pass: false });
  assert.equal(result.finishedAssignment.status, "rejected");
  assert.equal(result.nextAssignment, null);
});

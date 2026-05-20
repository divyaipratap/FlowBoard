import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb, initDb } from "./db";
import {
  approveAgentInboxProposal,
  listAgentAuditLog,
  listAgentWorklogEntries,
  listWorkProofsForIssue,
  runFlowBoardTool,
  updateAgentBridgeSettings,
} from "./agentBridge";
import { computeProofHash, deriveChecks, deriveVerdict, parseWorkProofInput, verifyChain } from "./workProof";
import { createMcpConfig, resolveMcpCommandPath } from "./mcpConfig";
import {
  agentAuditLogTable,
  agentBridgeSettingsTable,
  agentInboxProposalsTable,
  agentWorklogEntriesTable,
  agentWorkProofsTable,
  commentsTable,
  issuesTable,
  projectsTable,
} from "./schema";
import { eq } from "drizzle-orm";

const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "flowboard-agent-bridge-db-")), "test.db");
initDb(dbPath);

const project = {
  id: "project-1",
  name: "Agent Bridge",
  key: "FAB",
  description: null,
  color: "#8b5cf6",
};

const baseIssue = {
  id: "issue-1",
  projectId: project.id,
  issueNumber: 7,
  title: "Cover Agent Bridge",
  description: "Add regression tests",
  status: "todo",
  priority: "high",
  type: "task",
  assignee: null,
  reporter: "Codex",
  labels: JSON.stringify(["tests"]),
};

function partialPermissions(permissions: Record<string, unknown>) {
  return permissions as any;
}

async function callTool(toolName: string, args: Record<string, unknown>) {
  return await runFlowBoardTool(toolName, args) as any;
}

async function resetDb() {
  const db = getDb();
  await db.delete(agentWorkProofsTable);
  await db.delete(agentWorklogEntriesTable);
  await db.delete(agentInboxProposalsTable);
  await db.delete(agentAuditLogTable);
  await db.delete(commentsTable);
  await db.delete(issuesTable);
  await db.delete(projectsTable);
  await db.delete(agentBridgeSettingsTable);
  await db.insert(projectsTable).values(project);
  await db.insert(issuesTable).values(baseIssue);
}

beforeEach(resetDb);

test("rejects disallowed agents and records an audit entry", async () => {
  await updateAgentBridgeSettings({ allowedAgents: ["Codex"] });

  const result = await callTool("flowboard_get_today_tasks", { agentName: "Other Agent" });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /not allowed/);

  const [entry] = await listAgentAuditLog(5);
  assert.equal(entry.agentName, "Other Agent");
  assert.equal(entry.status, "rejected");
  assert.equal(entry.action, "Reject disallowed agent");
});

test("reads issues by id and issue key", async () => {
  const byId = await callTool("flowboard_get_issue", { issueId: baseIssue.id, agentName: "Codex" });
  const byKey = await callTool("flowboard_get_issue", { issueKey: "FAB-7", agentName: "Codex" });

  assert.equal(byId.id, baseIssue.id);
  assert.equal(byId.issueKey, "FAB-7");
  assert.equal(byKey.id, baseIssue.id);
  assert.equal(byKey.projectKey, "FAB");
});

test("suggest-only status updates create proposals without changing the issue", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "suggest-only",
    permissions: partialPermissions({ updateStatus: "approval" }),
  });

  const result = await callTool("flowboard_update_issue_status", {
    issueId: baseIssue.id,
    status: "in_progress",
    agentName: "Codex",
  });

  assert.equal(result.approvalRequired, true);
  assert.equal(result.proposedStatus, "in_progress");

  const db = getDb();
  const [issue] = await db.select().from(issuesTable);
  const [proposal] = await db.select().from(agentInboxProposalsTable);
  assert.equal(issue.status, "todo");
  assert.equal(proposal.proposalType, "status_update");
});

test("trusted status updates apply immediately and are audited", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "trusted",
    permissions: partialPermissions({ updateStatus: "allow" }),
  });

  const result = await callTool("flowboard_update_issue_status", {
    issueKey: "FAB-7",
    status: "in_progress",
    agentName: "Codex",
  });

  assert.equal(result.applied, true);
  assert.equal(result.issue.status, "in_progress");

  const [entry] = await listAgentAuditLog(5);
  assert.equal(entry.toolName, "flowboard_update_issue_status");
  assert.equal(entry.status, "applied");
});

test("disable-writes rejects write tools even in trusted mode", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "trusted",
    disableWrites: true,
    permissions: partialPermissions({ updateStatus: "allow" }),
  });

  const result = await callTool("flowboard_start_issue", {
    issueId: baseIssue.id,
    agentName: "Codex",
  });

  assert.equal(result.applied, false);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /disabled/);
});

test("normalizes attach_work_summary payloads and creates worklogs in trusted mode", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "trusted",
    permissions: partialPermissions({ attachWorkSummaries: "allow" }),
  });

  const result = await callTool("flowboard_attach_work_summary", {
    issueId: baseIssue.id,
    agentName: "Codex",
    summary: "Added coverage",
    changedFiles: [" server/agentBridge.test.ts ", "", 42],
    commandsRun: ["pnpm test"],
    testsRun: ["agent bridge tests"],
    followUps: ["", "Review MCP smoke overlap"],
  });

  assert.equal(result.applied, true);

  const [worklog] = await listAgentWorklogEntries(baseIssue.id);
  assert.equal(worklog.summary, "Added coverage");
  assert.deepEqual(worklog.changedFiles, ["server/agentBridge.test.ts", "42"]);
  assert.deepEqual(worklog.commandsRun, ["pnpm test"]);
  assert.deepEqual(worklog.testsRun, ["agent bridge tests"]);
  assert.deepEqual(worklog.followUps, ["Review MCP smoke overlap"]);
});

test("normalizes create-followup proposal payloads and applies approval", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "suggest-only",
    permissions: partialPermissions({ createFollowUps: "approval" }),
  });

  const result = await callTool("flowboard_create_followup_issue", {
    projectId: project.id,
    title: "Follow up",
    description: "Next task",
    priority: "critical",
    type: "bug",
    labels: ["agent", 12],
    agentName: "Codex",
  });

  assert.equal(result.approvalRequired, true);

  const db = getDb();
  const [proposal] = await db.select().from(agentInboxProposalsTable);
  const payload = JSON.parse(proposal.payload);
  assert.deepEqual(payload.labels, ["agent", "12"]);
  assert.equal(payload.priority, "critical");

  const approved = await approveAgentInboxProposal(result.proposalId);
  assert.equal(approved.status, "approved");

  const issues = await db.select().from(issuesTable);
  const followUp = issues.find((issue) => issue.title === "Follow up");
  assert.ok(followUp);
  assert.equal(followUp?.priority, "critical");
  assert.deepEqual(JSON.parse(followUp?.labels ?? "[]"), ["agent", "12"]);
});

test("generates Codex and Cursor MCP config with runtime port file", async () => {
  const previousMcpPath = process.env.FLOWBOARD_MCP_PATH;
  const previousPortFile = process.env.FLOWBOARD_API_PORT_FILE;
  const previousPort = process.env.FLOWBOARD_SERVER_PORT;

  process.env.FLOWBOARD_MCP_PATH = path.join("C:", "FlowBoard", "dist", "main", "mcp.js");
  process.env.FLOWBOARD_API_PORT_FILE = path.join("C:", "Users", "Divya", "flowboard-api-port.json");
  process.env.FLOWBOARD_SERVER_PORT = "4999";

  try {
    const config = createMcpConfig();

    assert.deepEqual(config.cursor.mcpServers.flowboard, config.codex.mcpServers.flowboard);
    assert.equal(config.cursor.mcpServers.flowboard.command, "node");
    assert.deepEqual(config.cursor.mcpServers.flowboard.args, [
      process.env.FLOWBOARD_MCP_PATH,
      "--api-port-file",
      process.env.FLOWBOARD_API_PORT_FILE,
    ]);
    assert.equal(config.details.mcpScript, process.env.FLOWBOARD_MCP_PATH);
    assert.equal(config.details.apiPortFile, process.env.FLOWBOARD_API_PORT_FILE);
  } finally {
    if (previousMcpPath === undefined) delete process.env.FLOWBOARD_MCP_PATH;
    else process.env.FLOWBOARD_MCP_PATH = previousMcpPath;
    if (previousPortFile === undefined) delete process.env.FLOWBOARD_API_PORT_FILE;
    else process.env.FLOWBOARD_API_PORT_FILE = previousPortFile;
    if (previousPort === undefined) delete process.env.FLOWBOARD_SERVER_PORT;
    else process.env.FLOWBOARD_SERVER_PORT = previousPort;
  }
});

test("resolves MCP script beside the bundled main process by default", () => {
  const previousMcpPath = process.env.FLOWBOARD_MCP_PATH;
  delete process.env.FLOWBOARD_MCP_PATH;

  try {
    assert.equal(resolveMcpCommandPath(path.join("C:", "FlowBoard", "dist", "main")), path.join("C:", "FlowBoard", "dist", "main", "mcp.js"));
  } finally {
    if (previousMcpPath !== undefined) process.env.FLOWBOARD_MCP_PATH = previousMcpPath;
  }
});

test("parseWorkProofInput returns null when no auditable signal is present", () => {
  assert.equal(parseWorkProofInput(undefined), null);
  assert.equal(parseWorkProofInput({}), null);
  assert.equal(parseWorkProofInput({ agentModel: "claude-opus-4-7" }), null);
  assert.equal(parseWorkProofInput({ commands: [{ command: "x" }] }), null);
});

test("deriveVerdict returns green only when every command exits 0", () => {
  assert.equal(deriveVerdict([]), "unverified");
  assert.equal(deriveVerdict([{ name: "tests", command: "pnpm test", exitCode: 0, durationMs: null, stdoutTail: "", stderrTail: "" }]), "green");
  assert.equal(deriveVerdict([
    { name: "tests", command: "pnpm test", exitCode: 0, durationMs: null, stdoutTail: "", stderrTail: "" },
    { name: "lint", command: "pnpm lint", exitCode: 1, durationMs: null, stdoutTail: "", stderrTail: "" },
  ]), "red");
});

test("deriveChecks records pass/fail/missing per canonical check name", () => {
  const checks = deriveChecks([
    { name: "tests", command: "pnpm test", exitCode: 0, durationMs: null, stdoutTail: "", stderrTail: "" },
    { name: "lint", command: "pnpm lint", exitCode: 2, durationMs: null, stdoutTail: "", stderrTail: "" },
    { name: "custom", command: "echo", exitCode: 0, durationMs: null, stdoutTail: "", stderrTail: "" },
  ]);
  assert.equal(checks.tests, "pass");
  assert.equal(checks.lint, "fail");
  assert.equal(checks.typecheck, "missing");
  assert.equal(checks.build, "missing");
});

test("trusted attach_work_summary persists a WorkProof and emits a green verdict", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "trusted",
    permissions: partialPermissions({ attachWorkSummaries: "allow" }),
  });

  const result = await callTool("flowboard_attach_work_summary", {
    issueId: baseIssue.id,
    agentName: "Codex",
    summary: "Implemented X",
    workProof: {
      agentModel: "claude-opus-4-7",
      gitCommitSha: "abc1234567",
      gitDiffHashAfter: "deadbeefcafebabe",
      filesChanged: ["server/x.ts"],
      commands: [
        { name: "tests", command: "pnpm test", exitCode: 0, durationMs: 4200, stdoutTail: "ok", stderrTail: "" },
        { name: "lint", command: "pnpm lint", exitCode: 0, durationMs: 1800, stdoutTail: "", stderrTail: "" },
      ],
      environment: { os: "darwin", node: "20.10.0" },
      startedAt: "2026-05-20T10:00:00.000Z",
      finishedAt: "2026-05-20T10:00:06.000Z",
    },
  });

  assert.equal(result.applied, true);
  assert.ok(result.workProof);
  assert.equal(result.workProof.verdict, "green");
  assert.equal(result.workProof.chainIndex, 0);
  assert.equal(result.workProof.prevHash, null);
  assert.equal(result.workProof.checks.tests, "pass");
  assert.equal(result.workProof.checks.lint, "pass");
  assert.equal(result.workProof.commandResults.length, 2);

  const [worklog] = await listAgentWorklogEntries(baseIssue.id);
  assert.ok(worklog.workProof);
  assert.equal(worklog.workProof.id, result.workProof.id);
});

test("WorkProofs form a hash chain across consecutive attachments", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "trusted",
    permissions: partialPermissions({ attachWorkSummaries: "allow" }),
  });

  const first = await callTool("flowboard_attach_work_summary", {
    issueId: baseIssue.id,
    agentName: "Codex",
    summary: "Step 1",
    workProof: { gitDiffHashAfter: "first-diff", commands: [{ name: "tests", command: "pnpm test", exitCode: 0 }] },
  });
  const second = await callTool("flowboard_attach_work_summary", {
    issueId: baseIssue.id,
    agentName: "Codex",
    summary: "Step 2",
    workProof: { gitDiffHashAfter: "second-diff", commands: [{ name: "tests", command: "pnpm test", exitCode: 0 }] },
  });

  assert.equal(first.workProof.chainIndex, 0);
  assert.equal(second.workProof.chainIndex, 1);
  assert.equal(second.workProof.prevHash, first.workProof.proofHash);

  const listing = await listWorkProofsForIssue(baseIssue.id);
  assert.equal(listing.chainValid, true);
  assert.equal(listing.proofs.length, 2);
});

test("tampering with a stored WorkProof field is detected by chain verification", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "trusted",
    permissions: partialPermissions({ attachWorkSummaries: "allow" }),
  });

  const created = await callTool("flowboard_attach_work_summary", {
    issueId: baseIssue.id,
    agentName: "Codex",
    summary: "Tamper target",
    workProof: { gitDiffHashAfter: "real-diff", commands: [{ name: "tests", command: "pnpm test", exitCode: 1 }] },
  });
  assert.equal(created.workProof.verdict, "red");

  const db = getDb();
  await db
    .update(agentWorkProofsTable)
    .set({ verdict: "green" })
    .where(eq(agentWorkProofsTable.id, created.workProof.id));

  const listing = await listWorkProofsForIssue(baseIssue.id);
  assert.equal(listing.chainValid, false);
  assert.equal(listing.brokenAtChainIndex, 0);
});

test("verifyChain catches a broken prev_hash link", () => {
  const proofs = [
    {
      id: "a",
      worklogId: "w1",
      issueId: "i",
      projectId: "p",
      agentName: "A",
      agentModel: null,
      gitCommitSha: null,
      gitDiffHashBefore: null,
      gitDiffHashAfter: null,
      filesChanged: [],
      commandResults: [],
      checks: { tests: "missing" as const, lint: "missing" as const, typecheck: "missing" as const, build: "missing" as const },
      environment: {},
      verdict: "unverified" as const,
      startedAt: null,
      finishedAt: null,
      runtimeMs: null,
      chainIndex: 0,
      prevHash: null,
      proofHash: "",
      createdAt: new Date(),
    },
  ];
  proofs[0].proofHash = computeProofHash({
    agentModel: null,
    agentName: "A",
    chainIndex: 0,
    checks: proofs[0].checks,
    commandResults: [],
    environment: {},
    filesChanged: [],
    finishedAt: null,
    gitCommitSha: null,
    gitDiffHashAfter: null,
    gitDiffHashBefore: null,
    issueId: "i",
    prevHash: null,
    projectId: "p",
    runtimeMs: null,
    startedAt: null,
    verdict: "unverified",
    worklogId: "w1",
  });

  assert.equal(verifyChain(proofs).chainValid, true);

  const tampered = [{ ...proofs[0], prevHash: "garbage" }];
  assert.equal(verifyChain(tampered).chainValid, false);
});

test("requireGreenWorkProofToMarkDone blocks trusted markDone until a green proof is captured", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "trusted",
    permissions: partialPermissions({
      attachWorkSummaries: "allow",
      markDone: "allow",
      updateStatus: "allow",
      requireWorkSummaryToMarkDone: false,
      requireGreenWorkProofToMarkDone: true,
    }),
  });

  const blocked = await callTool("flowboard_update_issue_status", {
    issueId: baseIssue.id,
    status: "done",
    agentName: "Codex",
  });
  assert.equal(blocked.applied, false);
  assert.equal(blocked.approvalRequired, true);

  await callTool("flowboard_attach_work_summary", {
    issueId: baseIssue.id,
    agentName: "Codex",
    summary: "Red proof",
    workProof: { gitDiffHashAfter: "x", commands: [{ name: "tests", command: "pnpm test", exitCode: 1 }] },
  });
  const stillBlocked = await callTool("flowboard_update_issue_status", {
    issueId: baseIssue.id,
    status: "done",
    agentName: "Codex",
  });
  assert.equal(stillBlocked.applied, false);

  await callTool("flowboard_attach_work_summary", {
    issueId: baseIssue.id,
    agentName: "Codex",
    summary: "Green proof",
    workProof: { gitDiffHashAfter: "y", commands: [{ name: "tests", command: "pnpm test", exitCode: 0 }] },
  });
  const allowed = await callTool("flowboard_update_issue_status", {
    issueId: baseIssue.id,
    status: "done",
    agentName: "Codex",
  });
  assert.equal(allowed.applied, true);
  assert.equal(allowed.issue.status, "done");
});

test("suggest-only WorkProof rides the proposal payload and persists on approval", async () => {
  await updateAgentBridgeSettings({
    permissionMode: "suggest-only",
    permissions: partialPermissions({ attachWorkSummaries: "approval" }),
  });

  const suggested = await callTool("flowboard_attach_work_summary", {
    issueId: baseIssue.id,
    agentName: "Codex",
    summary: "Pending approval",
    workProof: { gitDiffHashAfter: "abc", commands: [{ name: "tests", command: "pnpm test", exitCode: 0 }] },
  });
  assert.equal(suggested.approvalRequired, true);
  assert.equal(suggested.workProofAttached, true);

  const db = getDb();
  const beforeApprove = await db.select().from(agentWorkProofsTable);
  assert.equal(beforeApprove.length, 0);

  await approveAgentInboxProposal(suggested.proposalId);

  const afterApprove = await db.select().from(agentWorkProofsTable);
  assert.equal(afterApprove.length, 1);
  assert.equal(afterApprove[0].verdict, "green");
});

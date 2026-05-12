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
  runFlowBoardTool,
  updateAgentBridgeSettings,
} from "./agentBridge";
import { createMcpConfig, resolveMcpCommandPath } from "./mcpConfig";
import {
  agentAuditLogTable,
  agentBridgeSettingsTable,
  agentInboxProposalsTable,
  agentWorklogEntriesTable,
  commentsTable,
  issuesTable,
  projectsTable,
} from "./schema";

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

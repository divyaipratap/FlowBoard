import { randomUUID } from "crypto";
import { and, desc, eq, like, ne, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  agentAuditLogTable,
  agentBridgeSettingsTable,
  agentInboxProposalsTable,
  agentWorklogEntriesTable,
  commentsTable,
  issuesTable,
  projectsTable,
} from "./schema";
import { FLOWBOARD_MCP_TOOLS } from "./agentTools";
import { emitFlowBoardEvent } from "./events";
import {
  createWorkProof,
  latestGreenWorkProofForIssue,
  listWorkProofsByWorklogIds,
  listWorkProofsForIssue,
  parseWorkProofInput,
  type WorkProofInput,
  type WorkProofRecord,
} from "./workProof";

export { listWorkProofsForIssue };

export type AgentPermissionMode = "suggest-only" | "trusted";

export type AgentBridgeSettings = {
  permissionMode: AgentPermissionMode;
  allowedAgents: string[];
  disableWrites: boolean;
  permissions: AgentBridgePermissions;
};

export type AgentBridgePermissions = {
  readTickets: "allow" | "never";
  createTickets: "approval" | "allow" | "never";
  updateStatus: "approval" | "allow" | "never";
  markDone: "approval" | "allow" | "never";
  addNotes: "approval" | "allow" | "never";
  attachWorkSummaries: "approval" | "allow" | "never";
  createFollowUps: "approval" | "allow" | "never";
  requireWorkSummaryToMarkDone: boolean;
  requireGreenWorkProofToMarkDone: boolean;
};

type AgentToolContext = {
  agentName?: string;
};

type ProposalType = "status_update" | "issue_note" | "work_summary" | "create_issue";

const SETTINGS_ID = "default";
const DEFAULT_SETTINGS: AgentBridgeSettings = {
  permissionMode: "suggest-only",
  allowedAgents: ["Codex", "Cursor", "MCP Agent"],
  disableWrites: false,
  permissions: {
    readTickets: "allow",
    createTickets: "approval",
    updateStatus: "approval",
    markDone: "approval",
    addNotes: "approval",
    attachWorkSummaries: "approval",
    createFollowUps: "approval",
    requireWorkSummaryToMarkDone: true,
    requireGreenWorkProofToMarkDone: false,
  },
};

function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function parseLabels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeSettings(row: typeof agentBridgeSettingsTable.$inferSelect): AgentBridgeSettings {
  const permissions = { ...DEFAULT_SETTINGS.permissions, ...parseJsonRecord(row.permissions) } as AgentBridgePermissions;
  return {
    permissionMode: row.permissionMode === "trusted" ? "trusted" : "suggest-only",
    allowedAgents: parseJsonList(row.allowedAgents),
    disableWrites: Boolean(row.disableWrites),
    permissions,
  };
}

function normalizeIssue(
  issue: typeof issuesTable.$inferSelect,
  project?: typeof projectsTable.$inferSelect
) {
  return {
    ...issue,
    labels: parseLabels(issue.labels),
    issueKey: `${project?.key ?? "PROJ"}-${issue.issueNumber}`,
    projectName: project?.name ?? "Unknown project",
    projectKey: project?.key ?? "PROJ",
  };
}

async function auditLog(input: {
  agentName?: string;
  toolName: string;
  issueId?: string | null;
  projectId?: string | null;
  action: string;
  status: "read" | "applied" | "suggested" | "rejected" | "error";
  input?: unknown;
  result?: unknown;
}) {
  const db = getDb();
  await db.insert(agentAuditLogTable).values({
    id: randomUUID(),
    agentName: input.agentName?.trim() || "Unknown agent",
    toolName: input.toolName,
    issueId: input.issueId ?? null,
    projectId: input.projectId ?? null,
    action: input.action,
    status: input.status,
    input: safeJson(input.input),
    result: safeJson(input.result),
  });
}

function normalizeProposal(proposal: typeof agentInboxProposalsTable.$inferSelect) {
  return {
    ...proposal,
    payload: parseJsonRecord(proposal.payload),
    resolution: parseJsonRecord(proposal.resolution),
  };
}

function normalizeWorklog(entry: typeof agentWorklogEntriesTable.$inferSelect, workProof?: WorkProofRecord | null) {
  return {
    ...entry,
    changedFiles: parseJsonList(entry.changedFiles),
    commandsRun: parseJsonList(entry.commandsRun),
    testsRun: parseJsonList(entry.testsRun),
    followUps: parseJsonList(entry.followUps),
    workProof: workProof ?? null,
  };
}

export async function listAgentWorklogEntries(issueId: string) {
  const db = getDb();
  const entries = await db
    .select()
    .from(agentWorklogEntriesTable)
    .where(eq(agentWorklogEntriesTable.issueId, issueId))
    .orderBy(desc(agentWorklogEntriesTable.createdAt));
  const proofs = await listWorkProofsByWorklogIds(entries.map((entry) => entry.id));
  return entries.map((entry) => normalizeWorklog(entry, proofs.get(entry.id) ?? null));
}

async function createAgentWorklogEntry(
  issue: typeof issuesTable.$inferSelect,
  input: Record<string, unknown>,
  agentName: string,
  workProofInput?: WorkProofInput | null,
) {
  const db = getDb();
  const [entry] = await db.insert(agentWorklogEntriesTable).values({
    id: randomUUID(),
    issueId: issue.id,
    projectId: issue.projectId,
    agentName,
    summary: String(input.summary ?? "").trim(),
    changedFiles: safeJson(parseStringList(input.changedFiles)),
    commandsRun: safeJson(parseStringList(input.commandsRun)),
    testsRun: safeJson(parseStringList(input.testsRun)),
    followUps: safeJson(parseStringList(input.followUps)),
  }).returning();

  let workProof: WorkProofRecord | null = null;
  if (workProofInput) {
    workProof = await createWorkProof({
      worklogId: entry.id,
      issueId: issue.id,
      projectId: issue.projectId,
      agentName,
      input: workProofInput,
    });
  }

  await db.update(issuesTable).set({ updatedAt: new Date() }).where(eq(issuesTable.id, issue.id));
  emitFlowBoardEvent({ type: "issue.updated", issueId: issue.id, projectId: issue.projectId, status: issue.status });
  return normalizeWorklog(entry, workProof);
}

async function createInboxProposal(input: {
  agentName: string;
  toolName: string;
  proposalType: ProposalType;
  action: string;
  issueId?: string | null;
  projectId?: string | null;
  title: string;
  description?: string | null;
  payload: Record<string, unknown>;
}) {
  const db = getDb();
  const [proposal] = await db.insert(agentInboxProposalsTable).values({
    id: randomUUID(),
    agentName: input.agentName,
    toolName: input.toolName,
    proposalType: input.proposalType,
    action: input.action,
    issueId: input.issueId ?? null,
    projectId: input.projectId ?? null,
    title: input.title,
    description: input.description ?? null,
    payload: safeJson(input.payload),
  }).returning();
  emitFlowBoardEvent({ type: "proposal.changed", issueId: proposal.issueId, projectId: proposal.projectId });
  return normalizeProposal(proposal);
}

export async function listAgentInboxProposals(status = "pending", limit = 30) {
  const db = getDb();
  const clampedLimit = Math.min(Math.max(limit, 1), 100);
  const query = db
    .select()
    .from(agentInboxProposalsTable)
    .orderBy(desc(agentInboxProposalsTable.createdAt))
    .limit(clampedLimit);
  const proposals = status === "all"
    ? await query
    : await db
      .select()
      .from(agentInboxProposalsTable)
      .where(eq(agentInboxProposalsTable.status, status))
      .orderBy(desc(agentInboxProposalsTable.createdAt))
      .limit(clampedLimit);
  return proposals.map(normalizeProposal);
}

export async function updateAgentInboxProposal(proposalId: string, input: {
  title?: string;
  description?: string | null;
  payload?: Record<string, unknown>;
}) {
  const db = getDb();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof input.title === "string" && input.title.trim()) update.title = input.title.trim();
  if (typeof input.description === "string" || input.description === null) update.description = input.description;
  if (input.payload && typeof input.payload === "object") update.payload = safeJson(input.payload);
  const [proposal] = await db
    .update(agentInboxProposalsTable)
    .set(update as any)
    .where(and(eq(agentInboxProposalsTable.id, proposalId), eq(agentInboxProposalsTable.status, "pending")))
    .returning();
  if (!proposal) throw new Error("Pending proposal not found");
  emitFlowBoardEvent({ type: "proposal.changed", issueId: proposal.issueId, projectId: proposal.projectId });
  return normalizeProposal(proposal);
}

async function createIssueFromProposal(
  projectId: string,
  payload: Record<string, unknown>,
  reporter: string,
) {
  const db = getDb();
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) throw new Error("Project not found");
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(issue_number), 0)` })
    .from(issuesTable)
    .where(eq(issuesTable.projectId, projectId));
  const [issue] = await db.insert(issuesTable).values({
    id: randomUUID(),
    projectId,
    issueNumber: Number(maxRow?.max ?? 0) + 1,
    title: String(payload.title ?? "Untitled follow-up").trim(),
    description: typeof payload.description === "string" ? payload.description : null,
    status: typeof payload.status === "string" ? payload.status : "todo",
    priority: typeof payload.priority === "string" ? payload.priority : "medium",
    type: typeof payload.type === "string" ? payload.type : "task",
    reporter,
    labels: JSON.stringify(Array.isArray(payload.labels) ? payload.labels.map(String) : ["agent-follow-up"]),
  }).returning();
  emitFlowBoardEvent({ type: "issue.created", issueId: issue.id, projectId, status: issue.status });
  return normalizeIssue(issue, project);
}

async function resolveProposal(
  proposalId: string,
  status: "approved" | "rejected",
  resolution: Record<string, unknown>,
) {
  const db = getDb();
  const [proposal] = await db.update(agentInboxProposalsTable).set({
    status,
    resolution: safeJson(resolution),
    updatedAt: new Date(),
    resolvedAt: new Date(),
  }).where(eq(agentInboxProposalsTable.id, proposalId)).returning();
  if (!proposal) throw new Error("Proposal not found");
  emitFlowBoardEvent({ type: "proposal.changed", issueId: proposal.issueId, projectId: proposal.projectId });
  return normalizeProposal(proposal);
}

export async function rejectAgentInboxProposal(proposalId: string) {
  const db = getDb();
  const [proposal] = await db.select().from(agentInboxProposalsTable).where(eq(agentInboxProposalsTable.id, proposalId));
  if (!proposal || proposal.status !== "pending") throw new Error("Pending proposal not found");
  const resolved = await resolveProposal(proposalId, "rejected", { rejected: true });
  await auditLog({
    agentName: proposal.agentName,
    toolName: proposal.toolName,
    issueId: proposal.issueId,
    projectId: proposal.projectId,
    action: `Reject proposal: ${proposal.action}`,
    status: "rejected",
    input: { proposalId },
    result: { proposalId },
  });
  return resolved;
}

export async function approveAgentInboxProposal(proposalId: string) {
  const db = getDb();
  const [proposal] = await db.select().from(agentInboxProposalsTable).where(eq(agentInboxProposalsTable.id, proposalId));
  if (!proposal || proposal.status !== "pending") throw new Error("Pending proposal not found");
  const payload = parseJsonRecord(proposal.payload);
  let result: Record<string, unknown>;

  if (proposal.proposalType === "status_update") {
    if (!proposal.issueId) throw new Error("Proposal is missing an issue");
    const update: Record<string, unknown> = {
      status: String(payload.status ?? "in_progress"),
      updatedAt: new Date(),
    };
    if (payload.assignee) update.assignee = String(payload.assignee);
    const [issue] = await db.update(issuesTable).set(update as any).where(eq(issuesTable.id, proposal.issueId)).returning();
    result = { applied: true, issueId: issue.id, status: issue.status };
    emitFlowBoardEvent({ type: "issue.updated", issueId: issue.id, projectId: issue.projectId, status: issue.status });
  } else if (proposal.proposalType === "issue_note" || proposal.proposalType === "work_summary") {
    if (!proposal.issueId) throw new Error("Proposal is missing an issue");
    if (proposal.proposalType === "work_summary") {
      const issue = await findIssueByIdOrKey(proposal.issueId);
      if (!issue) throw new Error("Issue not found");
      const workProofInput = parseWorkProofInput(payload.workProof);
      const worklog = await createAgentWorklogEntry(issue, payload, proposal.agentName, workProofInput);
      const comment = await createAppliedComment(proposal.issueId, `Agent work summary added by ${proposal.agentName}: ${worklog.summary}`, proposal.agentName);
      result = { applied: true, worklogId: worklog.id, commentId: comment.id, workProofId: worklog.workProof?.id ?? null };
      emitFlowBoardEvent({ type: "comment.created", issueId: proposal.issueId, projectId: proposal.projectId });
    } else {
      const comment = await createAppliedComment(proposal.issueId, String(payload.content ?? proposal.description ?? ""), proposal.agentName);
      result = { applied: true, commentId: comment.id };
      emitFlowBoardEvent({ type: "comment.created", issueId: proposal.issueId, projectId: proposal.projectId });
    }
  } else if (proposal.proposalType === "create_issue") {
    const projectId = proposal.projectId ?? String(payload.projectId ?? "");
    const issue = await createIssueFromProposal(projectId, { ...payload, title: proposal.title, description: proposal.description }, proposal.agentName);
    result = { applied: true, issueId: issue.id, issueKey: issue.issueKey };
  } else {
    throw new Error(`Unsupported proposal type: ${proposal.proposalType}`);
  }

  const resolved = await resolveProposal(proposalId, "approved", result);
  await auditLog({
    agentName: proposal.agentName,
    toolName: proposal.toolName,
    issueId: proposal.issueId,
    projectId: proposal.projectId,
    action: `Approve proposal: ${proposal.action}`,
    status: "applied",
    input: { proposalId },
    result,
  });
  return resolved;
}

export async function mergeAgentInboxProposal(proposalId: string, issueIdOrKey: string) {
  const db = getDb();
  const [proposal] = await db.select().from(agentInboxProposalsTable).where(eq(agentInboxProposalsTable.id, proposalId));
  if (!proposal || proposal.status !== "pending") throw new Error("Pending proposal not found");
  const targetIssue = await findIssueByIdOrKey(issueIdOrKey);
  if (!targetIssue) throw new Error("Target issue not found");
  const payload = parseJsonRecord(proposal.payload);
  const content = [
    `Merged agent proposal: ${proposal.title}`,
    proposal.description,
    payload.content ? String(payload.content) : "",
  ].filter(Boolean).join("\n\n");
  const comment = await createAppliedComment(targetIssue.id, content, proposal.agentName);
  emitFlowBoardEvent({ type: "comment.created", issueId: targetIssue.id, projectId: targetIssue.projectId });
  const resolved = await resolveProposal(proposalId, "approved", { mergedIntoIssueId: targetIssue.id, commentId: comment.id });
  await auditLog({
    agentName: proposal.agentName,
    toolName: proposal.toolName,
    issueId: targetIssue.id,
    projectId: targetIssue.projectId,
    action: `Merge proposal: ${proposal.action}`,
    status: "applied",
    input: { proposalId, issueIdOrKey },
    result: { commentId: comment.id },
  });
  return resolved;
}

export async function getAgentBridgeSettings(): Promise<AgentBridgeSettings> {
  const db = getDb();
  const [existing] = await db.select().from(agentBridgeSettingsTable).where(eq(agentBridgeSettingsTable.id, SETTINGS_ID));
  if (existing) return normalizeSettings(existing);

  const [created] = await db
    .insert(agentBridgeSettingsTable)
    .values({
      id: SETTINGS_ID,
      permissionMode: DEFAULT_SETTINGS.permissionMode,
      allowedAgents: JSON.stringify(DEFAULT_SETTINGS.allowedAgents),
      disableWrites: DEFAULT_SETTINGS.disableWrites,
      permissions: safeJson(DEFAULT_SETTINGS.permissions),
    })
    .returning();
  return normalizeSettings(created);
}

export async function updateAgentBridgeSettings(settings: Partial<AgentBridgeSettings>) {
  const db = getDb();
  await getAgentBridgeSettings();
  const next = {
    ...(settings.permissionMode ? { permissionMode: settings.permissionMode === "trusted" ? "trusted" : "suggest-only" } : {}),
    ...(settings.allowedAgents ? { allowedAgents: JSON.stringify(settings.allowedAgents.map((agent) => agent.trim()).filter(Boolean)) } : {}),
    ...(typeof settings.disableWrites === "boolean" ? { disableWrites: settings.disableWrites } : {}),
    ...(settings.permissions ? { permissions: safeJson({ ...DEFAULT_SETTINGS.permissions, ...settings.permissions }) } : {}),
    updatedAt: new Date(),
  };
  const [updated] = await db
    .update(agentBridgeSettingsTable)
    .set(next)
    .where(eq(agentBridgeSettingsTable.id, SETTINGS_ID))
    .returning();
  return normalizeSettings(updated);
}

export async function listAgentAuditLog(limit = 30) {
  const db = getDb();
  return db
    .select()
    .from(agentAuditLogTable)
    .orderBy(desc(agentAuditLogTable.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getAgentBridgeStatus() {
  const settings = await getAgentBridgeSettings();
  return {
    status: "ready",
    transport: "stdio",
    tools: FLOWBOARD_MCP_TOOLS.map((tool) => tool.name),
    settings,
  };
}

type WriteAction = "createTickets" | "updateStatus" | "markDone" | "addNotes" | "attachWorkSummaries" | "createFollowUps";

async function writeDecision(action: WriteAction) {
  const settings = await getAgentBridgeSettings();
  const policy = settings.permissions[action] ?? "approval";
  if (settings.disableWrites || policy === "never") return "rejected" as const;
  if (settings.permissionMode === "trusted" && policy === "allow") return "allowed" as const;
  return "approval" as const;
}

async function canMarkDone(issueId: string) {
  const settings = await getAgentBridgeSettings();
  if (settings.permissions.requireWorkSummaryToMarkDone) {
    const entries = await listAgentWorklogEntries(issueId);
    if (entries.length === 0) return false;
  }
  if (settings.permissions.requireGreenWorkProofToMarkDone) {
    const proof = await latestGreenWorkProofForIssue(issueId);
    if (!proof) return false;
  }
  return true;
}

async function findIssueByIdOrKey(issueIdOrKey: string) {
  const db = getDb();
  const [byId] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueIdOrKey));
  if (byId) return byId;

  const parts = issueIdOrKey.split("-");
  const issueNumber = Number(parts.at(-1));
  const projectKey = parts.slice(0, -1).join("-").toUpperCase();
  if (!projectKey || !Number.isFinite(issueNumber)) return null;

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.key, projectKey));
  if (!project) return null;

  const [byKey] = await db
    .select()
    .from(issuesTable)
    .where(and(eq(issuesTable.projectId, project.id), eq(issuesTable.issueNumber, issueNumber)));
  return byKey ?? null;
}

async function projectForIssue(issue: typeof issuesTable.$inferSelect) {
  const db = getDb();
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, issue.projectId));
  return project;
}

async function createAppliedComment(issueId: string, content: string, author: string) {
  const db = getDb();
  const [comment] = await db
    .insert(commentsTable)
    .values({
      id: randomUUID(),
      issueId,
      content,
      author,
    })
    .returning();
  await db.update(issuesTable).set({ updatedAt: new Date() }).where(eq(issuesTable.id, issueId));
  return comment;
}

function workSummaryContent(input: Record<string, unknown>) {
  const lines = [
    "Agent work summary",
    "",
    `Summary: ${String(input.summary ?? "").trim()}`,
  ];
  const files = Array.isArray(input.changedFiles) ? input.changedFiles.map(String).filter(Boolean) : [];
  const commands = Array.isArray(input.commandsRun) ? input.commandsRun.map(String).filter(Boolean) : [];
  const tests = Array.isArray(input.testsRun) ? input.testsRun.map(String).filter(Boolean) : [];
  const followUps = Array.isArray(input.followUps) ? input.followUps.map(String).filter(Boolean) : [];

  if (files.length) lines.push("", "Files changed:", ...files.map((file) => `- ${file}`));
  if (commands.length) lines.push("", "Commands:", ...commands.map((command) => `- ${command}`));
  if (tests.length) lines.push("", "Validation:", ...tests.map((test) => `- ${test}`));
  if (followUps.length) lines.push("", "Follow-ups:", ...followUps.map((followUp) => `- ${followUp}`));
  return lines.join("\n");
}

export async function runFlowBoardTool(toolName: string, args: Record<string, unknown> = {}, context: AgentToolContext = {}) {
  const db = getDb();
  const agentName = String(args.agentName ?? context.agentName ?? "MCP Agent");

  try {
    const settings = await getAgentBridgeSettings();
    if (settings.allowedAgents.length > 0 && !settings.allowedAgents.includes(agentName)) {
      const result = { allowed: false, reason: `${agentName} is not allowed to use Agent Bridge.` };
      await auditLog({ agentName, toolName, action: "Reject disallowed agent", status: "rejected", input: args, result });
      return result;
    }

    if (toolName === "flowboard_get_today_tasks") {
      if (settings.permissions.readTickets === "never") {
        const result = { allowed: false, reason: "Reading tickets is disabled for agents." };
        await auditLog({ agentName, toolName, action: "Reject ticket read", status: "rejected", input: args, result });
        return result;
      }
      const limit = Math.min(Math.max(Number(args.limit ?? 12), 1), 50);
      const issues = await db.select().from(issuesTable).where(ne(issuesTable.status, "done")).orderBy(desc(issuesTable.updatedAt)).limit(limit);
      const projects = await db.select().from(projectsTable);
      const projectsById = new Map(projects.map((project) => [project.id, project]));
      const result = issues.map((issue) => normalizeIssue(issue, projectsById.get(issue.projectId)));
      await auditLog({ agentName, toolName, action: "Read today's tasks", status: "read", input: args, result: { count: result.length } });
      return { tasks: result };
    }

    if (toolName === "flowboard_get_issue") {
      if (settings.permissions.readTickets === "never") {
        const result = { allowed: false, reason: "Reading tickets is disabled for agents." };
        await auditLog({ agentName, toolName, action: "Reject issue read", status: "rejected", input: args, result });
        return result;
      }
      const issueId = String(args.issueId ?? args.issueKey ?? "");
      const issue = await findIssueByIdOrKey(issueId);
      if (!issue) throw new Error("Issue not found");
      const project = await projectForIssue(issue);
      const comments = await db.select().from(commentsTable).where(eq(commentsTable.issueId, issue.id)).orderBy(commentsTable.createdAt);
      const result = { ...normalizeIssue(issue, project), comments };
      await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Fetch issue", status: "read", input: args, result: { issueKey: result.issueKey } });
      return result;
    }

    if (toolName === "flowboard_search_issues") {
      if (settings.permissions.readTickets === "never") {
        const result = { allowed: false, reason: "Reading tickets is disabled for agents." };
        await auditLog({ agentName, toolName, action: "Reject issue search", status: "rejected", input: args, result });
        return result;
      }
      const query = String(args.query ?? "").trim();
      const status = typeof args.status === "string" ? args.status : undefined;
      const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 50);
      const filters = [];
      if (query) filters.push(or(like(issuesTable.title, `%${query}%`), like(issuesTable.description, `%${query}%`)));
      if (status) filters.push(eq(issuesTable.status, status));
      const issues = await db
        .select()
        .from(issuesTable)
        .where(filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters))
        .orderBy(desc(issuesTable.updatedAt))
        .limit(limit);
      const projects = await db.select().from(projectsTable);
      const projectsById = new Map(projects.map((project) => [project.id, project]));
      const result = issues.map((issue) => normalizeIssue(issue, projectsById.get(issue.projectId)));
      await auditLog({ agentName, toolName, action: "Search issues", status: "read", input: args, result: { count: result.length } });
      return { issues: result };
    }

    if (toolName === "flowboard_start_issue") {
      const issue = await findIssueByIdOrKey(String(args.issueId ?? args.issueKey ?? ""));
      if (!issue) throw new Error("Issue not found");
      const decision = await writeDecision("updateStatus");
      if (decision === "rejected") {
        const result = { applied: false, allowed: false, reason: "Starting issues is disabled by Agent Rules." };
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Reject start issue", status: "rejected", input: args, result });
        return result;
      }
      if (decision === "approval") {
      const proposal = await createInboxProposal({
          agentName,
          toolName,
          proposalType: "status_update",
          action: "Start issue",
          issueId: issue.id,
          projectId: issue.projectId,
          title: `Start ${String(args.issueKey ?? issue.id)}`,
          description: `Move this issue to in_progress and assign it to ${agentName}.`,
          payload: { status: "in_progress", assignee: agentName },
        });
        const result = { applied: false, approvalRequired: true, proposalId: proposal.id, proposedStatus: "in_progress" };
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Start issue", status: "suggested", input: args, result });
        return result;
      }
      const [updated] = await db.update(issuesTable).set({ status: "in_progress", assignee: agentName, updatedAt: new Date() }).where(eq(issuesTable.id, issue.id)).returning();
      const result = { applied: true, issue: normalizeIssue(updated, await projectForIssue(updated)) };
      emitFlowBoardEvent({ type: "issue.updated", issueId: updated.id, projectId: updated.projectId, status: updated.status });
      await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Start issue", status: "applied", input: args, result: { status: updated.status } });
      return result;
    }

    if (toolName === "flowboard_add_issue_note") {
      const issue = await findIssueByIdOrKey(String(args.issueId ?? args.issueKey ?? ""));
      if (!issue) throw new Error("Issue not found");
      const content = String(args.note ?? "").trim();
      if (!content) throw new Error("note is required");
      const decision = await writeDecision("addNotes");
      if (decision === "rejected") {
        const result = { applied: false, allowed: false, reason: "Adding notes is disabled by Agent Rules." };
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Reject progress note", status: "rejected", input: args, result });
        return result;
      }
      if (decision === "approval") {
        const proposal = await createInboxProposal({
          agentName,
          toolName,
          proposalType: "issue_note",
          action: "Add progress note",
          issueId: issue.id,
          projectId: issue.projectId,
          title: "Add agent progress note",
          description: content,
          payload: { content },
        });
        const result = { applied: false, approvalRequired: true, proposalId: proposal.id, note: content };
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Add progress note", status: "suggested", input: args, result });
        return result;
      }
      const comment = await createAppliedComment(issue.id, content, agentName);
      emitFlowBoardEvent({ type: "comment.created", issueId: issue.id, projectId: issue.projectId });
      await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Add progress note", status: "applied", input: args, result: { commentId: comment.id } });
      return { applied: true, comment };
    }

    if (toolName === "flowboard_update_issue_status") {
      const issue = await findIssueByIdOrKey(String(args.issueId ?? args.issueKey ?? ""));
      if (!issue) throw new Error("Issue not found");
      const status = String(args.status ?? "").trim();
      if (!status) throw new Error("status is required");
      const action = status === "done" ? "markDone" : "updateStatus";
      const decision = await writeDecision(action);
      if (decision === "rejected") {
        const result = { applied: false, allowed: false, reason: `${status === "done" ? "Marking done" : "Status updates"} are disabled by Agent Rules.` };
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Reject status update", status: "rejected", input: args, result });
        return result;
      }
      if (decision === "allowed" && status === "done" && !(await canMarkDone(issue.id))) {
        const result = { applied: false, approvalRequired: true, reason: "Trusted completion requires an Agent Worklog summary (and a green WorkProof if your rules require it) before marking done.", proposedStatus: status, currentStatus: issue.status };
        const proposal = await createInboxProposal({
          agentName,
          toolName,
          proposalType: "status_update",
          action: "Update issue status",
          issueId: issue.id,
          projectId: issue.projectId,
          title: `Change status to ${status}`,
          description: result.reason,
          payload: { status },
        });
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Require worklog before done", status: "suggested", input: args, result: { ...result, proposalId: proposal.id } });
        return { ...result, proposalId: proposal.id };
      }
      if (decision === "approval") {
        const proposal = await createInboxProposal({
          agentName,
          toolName,
          proposalType: "status_update",
          action: "Update issue status",
          issueId: issue.id,
          projectId: issue.projectId,
          title: `Change status to ${status}`,
          description: `Current status is ${issue.status}.`,
          payload: { status },
        });
        const result = { applied: false, approvalRequired: true, proposalId: proposal.id, proposedStatus: status, currentStatus: issue.status };
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Update issue status", status: "suggested", input: args, result });
        return result;
      }
      const [updated] = await db.update(issuesTable).set({ status, updatedAt: new Date() }).where(eq(issuesTable.id, issue.id)).returning();
      emitFlowBoardEvent({ type: "issue.updated", issueId: updated.id, projectId: updated.projectId, status: updated.status });
      await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Update issue status", status: "applied", input: args, result: { status } });
      return { applied: true, issue: normalizeIssue(updated, await projectForIssue(updated)) };
    }

    if (toolName === "flowboard_attach_work_summary") {
      const issue = await findIssueByIdOrKey(String(args.issueId ?? args.issueKey ?? ""));
      if (!issue) throw new Error("Issue not found");
      const content = workSummaryContent(args);
      if (!String(args.summary ?? "").trim()) throw new Error("summary is required");
      const workProofInput = parseWorkProofInput(args.workProof);
      const decision = await writeDecision("attachWorkSummaries");
      if (decision === "rejected") {
        const result = { applied: false, allowed: false, reason: "Attaching work summaries is disabled by Agent Rules." };
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Reject work summary", status: "rejected", input: args, result });
        return result;
      }
      if (decision === "approval") {
        const proposal = await createInboxProposal({
          agentName,
          toolName,
          proposalType: "work_summary",
          action: "Attach work summary",
          issueId: issue.id,
          projectId: issue.projectId,
          title: "Attach agent work summary",
          description: String(args.summary ?? "").trim(),
          payload: {
            summary: String(args.summary ?? "").trim(),
            changedFiles: parseStringList(args.changedFiles),
            commandsRun: parseStringList(args.commandsRun),
            testsRun: parseStringList(args.testsRun),
            followUps: parseStringList(args.followUps),
            content,
            workProof: workProofInput ? args.workProof : null,
          },
        });
        const result = { applied: false, approvalRequired: true, proposalId: proposal.id, summary: content, workProofAttached: workProofInput !== null };
        await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Attach work summary", status: "suggested", input: args, result });
        return result;
      }
      const worklog = await createAgentWorklogEntry(issue, args, agentName, workProofInput);
      const comment = await createAppliedComment(issue.id, `Agent work summary added by ${agentName}: ${worklog.summary}`, agentName);
      emitFlowBoardEvent({ type: "comment.created", issueId: issue.id, projectId: issue.projectId });
      await auditLog({ agentName, toolName, issueId: issue.id, projectId: issue.projectId, action: "Attach work summary", status: "applied", input: args, result: { worklogId: worklog.id, commentId: comment.id, workProofId: worklog.workProof?.id ?? null } });
      return { applied: true, worklog, comment, workProof: worklog.workProof };
    }

    if (toolName === "flowboard_create_followup_issue") {
      const title = String(args.title ?? "").trim();
      const projectId = String(args.projectId ?? "").trim();
      if (!title) throw new Error("title is required");
      if (!projectId) throw new Error("projectId is required");
      const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
      if (!project) throw new Error("Project not found");
      const decision = await writeDecision("createFollowUps");
      if (decision === "rejected") {
        const result = { applied: false, allowed: false, reason: "Creating follow-up issues is disabled by Agent Rules." };
        await auditLog({ agentName, toolName, projectId, action: "Reject follow-up issue", status: "rejected", input: args, result });
        return result;
      }
      if (decision === "approval") {
        const proposal = await createInboxProposal({
          agentName,
          toolName,
          proposalType: "create_issue",
          action: "Create follow-up issue",
          projectId,
          title,
          description: typeof args.description === "string" ? args.description : null,
          payload: {
            projectId,
            title,
            description: typeof args.description === "string" ? args.description : null,
            priority: typeof args.priority === "string" ? args.priority : "medium",
            type: typeof args.type === "string" ? args.type : "task",
            labels: Array.isArray(args.labels) ? args.labels.map(String) : ["agent-follow-up"],
          },
        });
        const result = { applied: false, approvalRequired: true, proposalId: proposal.id, title, projectId };
        await auditLog({ agentName, toolName, projectId, action: "Create follow-up issue", status: "suggested", input: args, result });
        return result;
      }
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(issue_number), 0)` })
        .from(issuesTable)
        .where(eq(issuesTable.projectId, projectId));
      const [issue] = await db.insert(issuesTable).values({
        id: randomUUID(),
        projectId,
        issueNumber: Number(maxRow?.max ?? 0) + 1,
        title,
        description: typeof args.description === "string" ? args.description : null,
        status: "todo",
        priority: typeof args.priority === "string" ? args.priority : "medium",
        type: typeof args.type === "string" ? args.type : "task",
        reporter: agentName,
        labels: JSON.stringify(Array.isArray(args.labels) ? args.labels.map(String) : ["agent-follow-up"]),
      }).returning();
      emitFlowBoardEvent({ type: "issue.created", issueId: issue.id, projectId, status: issue.status });
      await auditLog({ agentName, toolName, issueId: issue.id, projectId, action: "Create follow-up issue", status: "applied", input: args, result: { issueId: issue.id } });
      return { applied: true, issue: normalizeIssue(issue, project) };
    }

    throw new Error(`Unknown FlowBoard tool: ${toolName}`);
  } catch (error) {
    await auditLog({
      agentName,
      toolName,
      action: toolName,
      status: "error",
      input: args,
      result: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export { FLOWBOARD_MCP_TOOLS };

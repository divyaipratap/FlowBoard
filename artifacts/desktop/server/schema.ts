import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("#8b5cf6"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const issuesTable = sqliteTable("issues", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  issueNumber: integer("issue_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  type: text("type").notNull().default("task"),
  assignee: text("assignee"),
  reporter: text("reporter").notNull().default("You"),
  labels: text("labels").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const projectStatusesTable = sqliteTable("project_statuses", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const commentsTable = sqliteTable("comments", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  content: text("content").notNull(),
  author: text("author").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const attachmentsTable = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  kind: text("kind").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const flowSessionsTable = sqliteTable("flow_sessions", {
  id: text("id").primaryKey(),
  issueId: text("issue_id"),
  projectId: text("project_id"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dailyReviewsTable = sqliteTable("daily_reviews", {
  id: text("id").primaryKey(),
  date: text("date").notNull().unique(),
  summary: text("summary"),
  completedIssueIds: text("completed_issue_ids").notNull().default("[]"),
  carriedIssueIds: text("carried_issue_ids").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const issueSignalsTable = sqliteTable("issue_signals", {
  issueId: text("issue_id").primaryKey(),
  lastSuggestedAt: integer("last_suggested_at", { mode: "timestamp" }),
  lastStartedAt: integer("last_started_at", { mode: "timestamp" }),
  localScore: integer("local_score").notNull().default(0),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const agentBridgeSettingsTable = sqliteTable("agent_bridge_settings", {
  id: text("id").primaryKey(),
  permissionMode: text("permission_mode").notNull().default("suggest-only"),
  allowedAgents: text("allowed_agents").notNull().default("Codex,Cursor,MCP Agent"),
  disableWrites: integer("disable_writes", { mode: "boolean" }).notNull().default(false),
  permissions: text("permissions").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const agentAuditLogTable = sqliteTable("agent_audit_log", {
  id: text("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  toolName: text("tool_name").notNull(),
  issueId: text("issue_id"),
  projectId: text("project_id"),
  action: text("action").notNull(),
  status: text("status").notNull(),
  input: text("input").notNull().default("{}"),
  result: text("result").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const agentInboxProposalsTable = sqliteTable("agent_inbox_proposals", {
  id: text("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  toolName: text("tool_name").notNull(),
  proposalType: text("proposal_type").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull().default("pending"),
  issueId: text("issue_id"),
  projectId: text("project_id"),
  title: text("title").notNull(),
  description: text("description"),
  payload: text("payload").notNull().default("{}"),
  resolution: text("resolution"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

export const agentWorklogEntriesTable = sqliteTable("agent_worklog_entries", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  projectId: text("project_id").notNull(),
  agentName: text("agent_name").notNull(),
  summary: text("summary").notNull(),
  changedFiles: text("changed_files").notNull().default("[]"),
  commandsRun: text("commands_run").notNull().default("[]"),
  testsRun: text("tests_run").notNull().default("[]"),
  followUps: text("follow_ups").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

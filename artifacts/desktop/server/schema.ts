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

export const pulseRecipesTable = sqliteTable("pulse_recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  agentName: text("agent_name").notNull().default("Pulse"),
  selector: text("selector").notNull().default("{}"),
  scheduleExpr: text("schedule_expr").notNull().default("nightly"),
  rules: text("rules").notNull().default("{}"),
  proposal: text("proposal").notNull().default("{}"),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pulseRecipeRunsTable = sqliteTable("pulse_recipe_runs", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull(),
  triggeredBy: text("triggered_by").notNull().default("scheduled"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  status: text("status").notNull().default("running"),
  matchedCount: integer("matched_count").notNull().default(0),
  proposalIds: text("proposal_ids").notNull().default("[]"),
  skipped: text("skipped").notNull().default("[]"),
  errors: text("errors").notNull().default("[]"),
  notes: text("notes"),
});

export const pulseGlobalTable = sqliteTable("pulse_global", {
  id: text("id").primaryKey(),
  globalPaused: integer("global_paused", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const agentWorkProofsTable = sqliteTable("agent_work_proofs", {
  id: text("id").primaryKey(),
  worklogId: text("worklog_id").notNull().unique(),
  issueId: text("issue_id").notNull(),
  projectId: text("project_id").notNull(),
  agentName: text("agent_name").notNull(),
  agentModel: text("agent_model"),
  gitCommitSha: text("git_commit_sha"),
  gitDiffHashBefore: text("git_diff_hash_before"),
  gitDiffHashAfter: text("git_diff_hash_after"),
  filesChanged: text("files_changed").notNull().default("[]"),
  commandResults: text("command_results").notNull().default("[]"),
  checks: text("checks").notNull().default("{}"),
  environment: text("environment").notNull().default("{}"),
  verdict: text("verdict").notNull().default("unverified"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  runtimeMs: integer("runtime_ms"),
  chainIndex: integer("chain_index").notNull().default(0),
  prevHash: text("prev_hash"),
  proofHash: text("proof_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// FAB-15 — Team sync (CRDT, local-first). See lib/sync and docs/fab-15/.

export const syncRoomsTable = sqliteTable("sync_rooms", {
  id: text("id").primaryKey(),
  label: text("label"),
  relayUrl: text("relay_url").notNull(),
  keychainRef: text("keychain_ref").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastConnectedAt: integer("last_connected_at", { mode: "timestamp" }),
});

export const syncOutboundQueueTable = sqliteTable("sync_outbound_queue", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  envelope: text("envelope").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const syncPeerStateTable = sqliteTable("sync_peer_state", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  peerId: text("peer_id").notNull(),
  lastCounter: integer("last_counter").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

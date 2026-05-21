import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

export function initDb(dbPath: string): DB {
  if (_db) return _db;

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#8b5cf6',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      issue_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      type TEXT NOT NULL DEFAULT 'task',
      assignee TEXT,
      reporter TEXT NOT NULL DEFAULT 'You',
      labels TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS project_statuses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      kind TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS flow_sessions (
      id TEXT PRIMARY KEY,
      issue_id TEXT,
      project_id TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS daily_reviews (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      summary TEXT,
      completed_issue_ids TEXT NOT NULL DEFAULT '[]',
      carried_issue_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS issue_signals (
      issue_id TEXT PRIMARY KEY,
      last_suggested_at INTEGER,
      last_started_at INTEGER,
      local_score INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_bridge_settings (
      id TEXT PRIMARY KEY,
      permission_mode TEXT NOT NULL DEFAULT 'suggest-only',
      allowed_agents TEXT NOT NULL DEFAULT 'Codex,Cursor,MCP Agent',
      disable_writes INTEGER NOT NULL DEFAULT 0,
      permissions TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_audit_log (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      issue_id TEXT,
      project_id TEXT,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      input TEXT NOT NULL DEFAULT '{}',
      result TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_inbox_proposals (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      proposal_type TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      issue_id TEXT,
      project_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      resolution TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      resolved_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_worklog_entries (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      summary TEXT NOT NULL,
      changed_files TEXT NOT NULL DEFAULT '[]',
      commands_run TEXT NOT NULL DEFAULT '[]',
      tests_run TEXT NOT NULL DEFAULT '[]',
      follow_ups TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_work_proofs (
      id TEXT PRIMARY KEY,
      worklog_id TEXT NOT NULL UNIQUE,
      issue_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      agent_model TEXT,
      git_commit_sha TEXT,
      git_diff_hash_before TEXT,
      git_diff_hash_after TEXT,
      files_changed TEXT NOT NULL DEFAULT '[]',
      command_results TEXT NOT NULL DEFAULT '[]',
      checks TEXT NOT NULL DEFAULT '{}',
      environment TEXT NOT NULL DEFAULT '{}',
      verdict TEXT NOT NULL DEFAULT 'unverified',
      started_at INTEGER,
      finished_at INTEGER,
      runtime_ms INTEGER,
      chain_index INTEGER NOT NULL DEFAULT 0,
      prev_hash TEXT,
      proof_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_agent_work_proofs_issue
      ON agent_work_proofs(issue_id, chain_index);

    CREATE TABLE IF NOT EXISTS pulse_recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      agent_name TEXT NOT NULL DEFAULT 'Pulse',
      selector TEXT NOT NULL DEFAULT '{}',
      schedule_expr TEXT NOT NULL DEFAULT 'nightly',
      rules TEXT NOT NULL DEFAULT '{}',
      proposal TEXT NOT NULL DEFAULT '{}',
      last_run_at INTEGER,
      next_run_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS pulse_recipe_runs (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      triggered_by TEXT NOT NULL DEFAULT 'scheduled',
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL DEFAULT 'running',
      matched_count INTEGER NOT NULL DEFAULT 0,
      proposal_ids TEXT NOT NULL DEFAULT '[]',
      skipped TEXT NOT NULL DEFAULT '[]',
      errors TEXT NOT NULL DEFAULT '[]',
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pulse_recipe_runs_recipe
      ON pulse_recipe_runs(recipe_id, started_at);

    CREATE TABLE IF NOT EXISTS pulse_global (
      id TEXT PRIMARY KEY,
      global_paused INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  try {
    sqlite.exec("ALTER TABLE agent_bridge_settings ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}'");
  } catch {
    // Column already exists in databases initialized after this schema was added.
  }

  _db = drizzle(sqlite, { schema });
  return _db;
}

export function getDb(): DB {
  if (!_db) throw new Error("Database not initialized. Call initDb first.");
  return _db;
}

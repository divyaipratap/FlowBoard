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

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  _db = drizzle(sqlite, { schema });
  return _db;
}

export function getDb(): DB {
  if (!_db) throw new Error("Database not initialized. Call initDb first.");
  return _db;
}

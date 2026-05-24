// FAB-15 — Bridge integration tests.
//
// These exercise the SQLite ↔ Y.Doc bridge in isolation: no transport, no
// crypto. The contract is:
//   - applyLocalChangeToDoc writes to the Y.Doc with origin "local"
//   - the engine's own onUpdate handler picks that up and would broadcast it,
//     but we don't test that here (the transport is mocked separately).
//   - attachRemoteToSqliteBridge observes maps and reflects remote-origin
//     changes back into SQLite.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as Y from "yjs";
import { initDb, getDb } from "../db";
import { issuesTable, projectsTable, commentsTable } from "../schema";
import { applyLocalChangeToDoc, attachRemoteToSqliteBridge } from "./bridge";

// One DB per test run.
const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "flowboard-sync-bridge-")), "test.db");
initDb(dbPath);

async function seedProjectAndIssue(projectId: string, issueId: string, status = "todo") {
  const db = getDb();
  await db.insert(projectsTable).values({
    id: projectId,
    name: "Bridge Test",
    key: "BT",
    description: null,
    color: "#8b5cf6",
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
  }).onConflictDoNothing();
}

test("applyLocalChangeToDoc writes shadow with origin local", () => {
  const doc = new Y.Doc();
  let captured: { origin: unknown; size: number } | null = null;
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    captured = { origin, size: update.length };
  });

  applyLocalChangeToDoc(doc, {
    kind: "issue.upsert",
    issueId: "i-1",
    fields: { title: "Hello", status: "in_progress" },
  });

  assert.ok(captured, "update handler should have fired");
  assert.equal((captured as { origin: unknown }).origin, "local");
  const issues = doc.getMap("issues").get("i-1");
  assert.ok(issues instanceof Y.Map);
  assert.equal((issues as Y.Map<unknown>).get("title"), "Hello");
  assert.equal((issues as Y.Map<unknown>).get("status"), "in_progress");
});

test("remote shadow update reconciles back to SQLite", async () => {
  await seedProjectAndIssue("p-remote", "i-remote", "todo");

  const doc = new Y.Doc();
  const detach = attachRemoteToSqliteBridge(doc, () => "peer-abc");

  // Simulate a remote peer's update by transacting with origin "remote".
  doc.transact(() => {
    const issues = doc.getMap("issues");
    const shadow = new Y.Map<unknown>();
    shadow.set("status", "in_progress");
    issues.set("i-remote", shadow);
  }, "remote");

  // Allow the async observer + DB update to flush.
  await new Promise((r) => setTimeout(r, 50));

  const [row] = await getDb().select().from(issuesTable);
  assert.equal(row.status, "in_progress");
  detach();
});

test("local-origin shadow update does NOT trigger SQLite write", async () => {
  await seedProjectAndIssue("p-local", "i-local", "todo");

  const doc = new Y.Doc();
  const detach = attachRemoteToSqliteBridge(doc, () => "peer-abc");

  applyLocalChangeToDoc(doc, {
    kind: "issue.upsert",
    issueId: "i-local",
    fields: { status: "done" },
  });

  await new Promise((r) => setTimeout(r, 50));

  // Status in SQLite should remain "todo" because the bridge ignores local-origin updates.
  // Easier: explicitly fetch by id.
  const { eq } = await import("drizzle-orm");
  const [byId] = await getDb().select().from(issuesTable).where(eq(issuesTable.id, "i-local"));
  assert.equal(byId.status, "todo");
  detach();
});

test("status conflict: recent local change triggers conflict event", async () => {
  await seedProjectAndIssue("p-conflict", "i-conflict", "todo");

  const doc = new Y.Doc();
  const detach = attachRemoteToSqliteBridge(doc, () => "peer-xyz");

  // First, simulate a local status change so the conflict-window memory is populated.
  applyLocalChangeToDoc(doc, {
    kind: "issue.upsert",
    issueId: "i-conflict",
    fields: { status: "todo" }, // matches current SQLite
  });

  // Then a remote update changes the status. Because we just touched the
  // local status to "todo", and the current SQLite is also "todo", and the
  // remote wants "done", the bridge should NOT overwrite status.
  doc.transact(() => {
    const issues = doc.getMap("issues");
    let shadow = issues.get("i-conflict") as Y.Map<unknown> | undefined;
    if (!shadow) {
      shadow = new Y.Map<unknown>();
      issues.set("i-conflict", shadow);
    }
    shadow.set("status", "done");
  }, "remote");

  await new Promise((r) => setTimeout(r, 50));

  const { eq } = await import("drizzle-orm");
  const [byId] = await getDb().select().from(issuesTable).where(eq(issuesTable.id, "i-conflict"));
  // Status held back due to conflict — user must resolve.
  assert.equal(byId.status, "todo");
  detach();
});

test("comment.create flows through the bridge", async () => {
  await seedProjectAndIssue("p-comments", "i-comments");

  const doc = new Y.Doc();
  const detach = attachRemoteToSqliteBridge(doc, () => "peer-com");

  doc.transact(() => {
    const comments = doc.getMap("comments");
    const shadow = new Y.Map<unknown>();
    shadow.set("issueId", "i-comments");
    shadow.set("content", "Hi from remote");
    shadow.set("author", "Bob");
    comments.set("c-1", shadow);
  }, "remote");

  await new Promise((r) => setTimeout(r, 50));

  const { eq } = await import("drizzle-orm");
  const [comment] = await getDb().select().from(commentsTable).where(eq(commentsTable.id, "c-1"));
  assert.ok(comment, "comment should be inserted by the bridge");
  assert.equal(comment.content, "Hi from remote");
  assert.equal(comment.author, "Bob");
  detach();
});

// FAB-15 — SQLite ↔ Y.Doc bridge (Phase 2b).
//
// Mirrors mutable fields of issues, comments and projects between the local
// SQLite database (source of truth) and the Y.Doc that powers CRDT sync.
//
// Shape of the Y.Doc (one Y.Doc per room):
//   issues:   Y.Map<string, Y.Map<string, unknown>>     keyed by issueId
//             entries hold IssueShadow fields
//   comments: Y.Map<string, Y.Map<string, unknown>>     keyed by commentId
//   projects: Y.Map<string, Y.Map<string, unknown>>     keyed by projectId
//
// Why nested Y.Maps and not plain JSON objects?
//   - Field-level last-writer-wins is what we want for status/priority/etc.
//   - Y.Maps merge cleanly per-key when two peers edit different fields.
//   - Title/description could later upgrade to Y.Text for character-level merge.
//
// Conflict surface:
//   When a remote `status` change lands AND the local status was changed within
//   STATUS_CONFLICT_WINDOW_MS, we emit `sync.status_conflict` so the UI can ask
//   the user which one to keep. Other fields (priority, labels, etc.) silently
//   accept the remote value — they're rarely in flight at the same time.

import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { getDb } from "../db";
import { issuesTable, commentsTable, projectsTable } from "../schema";
import { emitFlowBoardEvent } from "../events";
import type { LocalChange, IssueShadow, ProjectShadow } from "@workspace/sync";

const STATUS_CONFLICT_WINDOW_MS = 30_000;

// Track recent local status changes so we can detect conflicts when remote
// status updates arrive. issueId → { status, atMs }.
const recentLocalStatus = new Map<string, { status: string; atMs: number }>();

function rememberLocalStatus(issueId: string, status: string): void {
  recentLocalStatus.set(issueId, { status, atMs: Date.now() });
  // Prune old entries to bound memory.
  const cutoff = Date.now() - STATUS_CONFLICT_WINDOW_MS;
  for (const [id, entry] of recentLocalStatus) {
    if (entry.atMs < cutoff) recentLocalStatus.delete(id);
  }
}

function readShadowMap<K extends string>(parent: Y.Map<unknown>, id: string): Y.Map<unknown> {
  const existing = parent.get(id);
  if (existing instanceof Y.Map) return existing as Y.Map<unknown>;
  const fresh = new Y.Map<unknown>();
  parent.set(id, fresh);
  return fresh;
}

/** Lazily-initialized typed views over the shared Y.Doc. */
function shadowRoots(doc: Y.Doc): {
  issues: Y.Map<unknown>;
  comments: Y.Map<unknown>;
  projects: Y.Map<unknown>;
} {
  return {
    issues: doc.getMap("issues"),
    comments: doc.getMap("comments"),
    projects: doc.getMap("projects"),
  };
}

/**
 * Mirror a local SQLite change into the Y.Doc.
 *
 * Caller (issue/comment/project routes) calls this AFTER the SQLite write
 * succeeds, so a transaction failure doesn't leak into the CRDT.
 *
 * Wrapped in a Y transaction with origin "local" so the engine's update
 * listener doesn't treat it as a remote echo.
 */
export function applyLocalChangeToDoc(doc: Y.Doc, change: LocalChange): void {
  const { issues, comments, projects } = shadowRoots(doc);

  doc.transact(() => {
    switch (change.kind) {
      case "issue.upsert": {
        const shadow = readShadowMap(issues, change.issueId);
        for (const [k, v] of Object.entries(change.fields)) {
          // Labels arrive as readonly string[]; clone before storing so Yjs
          // doesn't choke on the readonly modifier.
          if (k === "labels" && Array.isArray(v)) {
            shadow.set(k, [...v]);
          } else {
            shadow.set(k, v);
          }
        }
        if (typeof change.fields.status === "string") {
          rememberLocalStatus(change.issueId, change.fields.status);
        }
        break;
      }
      case "issue.delete": {
        issues.delete(change.issueId);
        recentLocalStatus.delete(change.issueId);
        break;
      }
      case "comment.create": {
        const shadow = readShadowMap(comments, change.commentId);
        shadow.set("issueId", change.issueId);
        shadow.set("content", change.content);
        shadow.set("author", change.author);
        break;
      }
      case "project.upsert": {
        const shadow = readShadowMap(projects, change.projectId);
        for (const [k, v] of Object.entries(change.fields)) {
          shadow.set(k, v);
        }
        break;
      }
    }
  }, "local");
}

/**
 * Apply the current state of a remote-modified Y.Map shadow back to SQLite.
 *
 * Strategy: when remote updates land, we observe Y.Doc state changes,
 * read the shadow's current values, and UPSERT into SQLite.  This is
 * idempotent — applying the same update twice is a no-op.
 *
 * Returns the list of SSE events to emit so the renderer can repaint.
 */
async function reconcileIssueFromShadow(
  issueId: string,
  shadow: Y.Map<unknown>,
): Promise<{ event: "issue.updated" | "issue.deleted"; projectId: string | null; status?: string; conflict?: { mine: string; theirs: string; at: string } } | null> {
  // Field validation — the shadow may contain partial fields if a peer only
  // updated one of them. We MERGE remote values into the existing row.
  const db = getDb();
  const [current] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId));

  if (!current) {
    // Remote created an issue we don't have locally. We don't have enough
    // context (project id, issue number) to materialize it. Phase 2c will
    // promote shadow.projectId/issueNumber to first-class fields. For now,
    // skip silently — it'll be created when the originating peer's full
    // CRDT snapshot syncs (e.g. on initial pairing).
    return null;
  }

  const next: Partial<IssueShadow> & { updatedAt: Date } = { updatedAt: new Date() };
  for (const key of ["title", "description", "status", "priority", "type", "assignee"] as const) {
    const value = shadow.get(key);
    if (value === undefined) continue;
    (next as Record<string, unknown>)[key] = value;
  }
  const labels = shadow.get("labels");
  if (Array.isArray(labels)) {
    (next as Record<string, unknown>).labels = JSON.stringify(labels);
  }

  // Conflict detection: if remote status differs from current status AND the
  // local status was changed inside the conflict window, surface to the user
  // instead of silently overwriting.
  let conflict: { mine: string; theirs: string; at: string } | undefined;
  if (typeof next.status === "string" && next.status !== current.status) {
    const recent = recentLocalStatus.get(issueId);
    if (recent && recent.status === current.status && Date.now() - recent.atMs < STATUS_CONFLICT_WINDOW_MS) {
      conflict = {
        mine: current.status,
        theirs: next.status,
        at: new Date().toISOString(),
      };
      // Don't apply the remote status yet — wait for user resolution.
      delete next.status;
    }
  }

  await db.update(issuesTable).set(next as never).where(eq(issuesTable.id, issueId));

  return {
    event: "issue.updated",
    projectId: current.projectId,
    status: typeof next.status === "string" ? next.status : current.status,
    conflict,
  };
}

async function reconcileCommentFromShadow(
  commentId: string,
  shadow: Y.Map<unknown>,
): Promise<{ event: "comment.created"; issueId: string; projectId: string | null } | null> {
  const db = getDb();
  const issueId = shadow.get("issueId");
  const content = shadow.get("content");
  const author = shadow.get("author");
  if (typeof issueId !== "string" || typeof content !== "string" || typeof author !== "string") {
    return null;
  }

  const [existing] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId));
  if (existing) return null; // Comments are insert-only in v1.

  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId));
  if (!issue) return null; // Same skip-until-snapshot logic as issues.

  await db.insert(commentsTable).values({ id: commentId, issueId, content, author });
  return { event: "comment.created", issueId, projectId: issue.projectId };
}

async function reconcileProjectFromShadow(
  projectId: string,
  shadow: Y.Map<unknown>,
): Promise<{ event: "project.changed"; projectId: string } | null> {
  const db = getDb();
  const [current] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!current) return null;

  const next: Partial<ProjectShadow> = {};
  for (const key of ["name", "description", "color"] as const) {
    const value = shadow.get(key);
    if (value === undefined) continue;
    (next as Record<string, unknown>)[key] = value;
  }
  if (Object.keys(next).length === 0) return null;

  await db.update(projectsTable).set(next as never).where(eq(projectsTable.id, projectId));
  return { event: "project.changed", projectId };
}

/**
 * Hook the Y.Doc's update listener so remote changes (origin === "remote")
 * propagate back into SQLite.  The engine attaches us — we don't manage the
 * subscription lifecycle ourselves.
 *
 * We observe the top-level shadow maps and react to entries that changed.
 */
export function attachRemoteToSqliteBridge(doc: Y.Doc, peerId: () => string | null): () => void {
  const { issues, comments, projects } = shadowRoots(doc);

  const observeIssues = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
    if (transaction.origin !== "remote") return;
    for (const [issueId, change] of event.changes.keys) {
      if (change.action === "delete") {
        void getDb().delete(issuesTable).where(eq(issuesTable.id, issueId)).then(() => {
          emitFlowBoardEvent({ type: "issue.deleted", issueId });
        });
        continue;
      }
      const shadow = issues.get(issueId);
      if (!(shadow instanceof Y.Map)) continue;
      void reconcileIssueFromShadow(issueId, shadow as Y.Map<unknown>).then((result) => {
        if (!result) return;
        emitFlowBoardEvent({
          type: result.event,
          issueId,
          projectId: result.projectId,
          ...(result.status ? { status: result.status } : {}),
        });
        if (result.conflict) {
          emitFlowBoardEvent({
            type: "sync.status_conflict",
            issueId,
            projectId: result.projectId,
            conflict: {
              issueId,
              mine: { status: result.conflict.mine, at: result.conflict.at },
              theirs: { status: result.conflict.theirs, at: result.conflict.at, peerId: peerId() ?? "unknown" },
            },
          });
        }
      });
    }
  };

  const observeComments = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
    if (transaction.origin !== "remote") return;
    for (const [commentId, change] of event.changes.keys) {
      if (change.action === "delete") {
        void getDb().delete(commentsTable).where(eq(commentsTable.id, commentId));
        continue;
      }
      const shadow = comments.get(commentId);
      if (!(shadow instanceof Y.Map)) continue;
      void reconcileCommentFromShadow(commentId, shadow as Y.Map<unknown>).then((result) => {
        if (!result) return;
        emitFlowBoardEvent({
          type: result.event,
          issueId: result.issueId,
          projectId: result.projectId,
        });
      });
    }
  };

  const observeProjects = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
    if (transaction.origin !== "remote") return;
    for (const [projectId, change] of event.changes.keys) {
      if (change.action === "delete") {
        void getDb().delete(projectsTable).where(eq(projectsTable.id, projectId));
        continue;
      }
      const shadow = projects.get(projectId);
      if (!(shadow instanceof Y.Map)) continue;
      void reconcileProjectFromShadow(projectId, shadow as Y.Map<unknown>).then((result) => {
        if (!result) return;
        emitFlowBoardEvent({ type: result.event, projectId: result.projectId });
      });
    }
  };

  issues.observe(observeIssues);
  comments.observe(observeComments);
  projects.observe(observeProjects);

  return () => {
    issues.unobserve(observeIssues);
    comments.unobserve(observeComments);
    projects.unobserve(observeProjects);
  };
}

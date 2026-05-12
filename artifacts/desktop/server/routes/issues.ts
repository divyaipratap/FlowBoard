import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { agentWorklogEntriesTable, issuesTable, commentsTable, projectsTable, attachmentsTable } from "../schema";
import { emitFlowBoardEvent } from "../events";
import {
  CreateIssueBody,
  CreateIssueParams,
  GetIssueParams,
  UpdateIssueParams,
  UpdateIssueBody,
  DeleteIssueParams,
  ListIssuesParams,
  ListIssuesQueryParams,
  ListCommentsParams,
  CreateCommentParams,
  CreateCommentBody,
  DeleteCommentParams,
  ListAttachmentsParams,
  CreateAttachmentParams,
  CreateAttachmentBody,
  DeleteAttachmentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const MAX_ATTACHMENTS_PER_ISSUE = 5;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_TEXT_TYPES = new Set(["text/plain"]);

function parseLabels(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return []; }
}

function issueKey(projectKey: string, num: number) {
  return `${projectKey}-${num}`;
}

function getAttachmentLimit(kind: string) {
  return kind === "image" ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
}

function isAllowedAttachment(kind: string, mimeType: string, fileName: string) {
  if (kind === "image") return ALLOWED_IMAGE_TYPES.has(mimeType);
  return ALLOWED_TEXT_TYPES.has(mimeType) && fileName.toLowerCase().endsWith(".txt");
}

router.get("/projects/:projectId/issues", async (req, res) => {
  const db = getDb();
  const { projectId } = ListIssuesParams.parse(req.params);
  const query = ListIssuesQueryParams.parse(req.query);

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  let issues = await db.select().from(issuesTable).where(eq(issuesTable.projectId, projectId));
  if (query.status) issues = issues.filter((i) => i.status === query.status);
  if (query.priority) issues = issues.filter((i) => i.priority === query.priority);
  if (query.type) issues = issues.filter((i) => i.type === query.type);
  if (query.assignee) issues = issues.filter((i) => i.assignee === query.assignee);
  if (query.search) { const s = query.search.toLowerCase(); issues = issues.filter((i) => i.title.toLowerCase().includes(s)); }

  const commentCounts = await db
    .select({ issueId: commentsTable.issueId, count: sql<number>`count(*)` })
    .from(commentsTable)
    .groupBy(commentsTable.issueId);
  const cMap = Object.fromEntries(commentCounts.map((c) => [c.issueId, Number(c.count)]));

  res.json(issues.map((i) => ({ ...i, labels: parseLabels(i.labels), issueKey: issueKey(project.key, i.issueNumber), commentCount: cMap[i.id] ?? 0 })));
});

router.post("/projects/:projectId/issues", async (req, res) => {
  const db = getDb();
  const { projectId } = CreateIssueParams.parse(req.params);
  const body = CreateIssueBody.parse(req.body);

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(issue_number), 0)` })
    .from(issuesTable)
    .where(eq(issuesTable.projectId, projectId));
  const issueNumber = Number(maxRow?.max ?? 0) + 1;

  const [issue] = await db
    .insert(issuesTable)
    .values({
      id: randomUUID(),
      projectId,
      issueNumber,
      title: body.title,
      description: body.description,
      status: body.status ?? "todo",
      priority: body.priority ?? "medium",
      type: body.type ?? "task",
      assignee: body.assignee,
      reporter: body.reporter ?? "You",
      labels: JSON.stringify(body.labels ?? []),
    })
    .returning();

  res.status(201).json({ ...issue, labels: parseLabels(issue.labels), issueKey: issueKey(project.key, issueNumber), commentCount: 0 });
  emitFlowBoardEvent({ type: "issue.created", issueId: issue.id, projectId, status: issue.status });
});

router.get("/issues/:issueId", async (req, res) => {
  const db = getDb();
  const { issueId } = GetIssueParams.parse(req.params);
  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId));
  if (!issue) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, issue.projectId));
  const comments = await db.select().from(commentsTable).where(eq(commentsTable.issueId, issueId)).orderBy(commentsTable.createdAt);

  res.json({ ...issue, labels: parseLabels(issue.labels), issueKey: issueKey(project?.key ?? "PROJ", issue.issueNumber), commentCount: comments.length, comments });
});

router.patch("/issues/:issueId", async (req, res) => {
  const db = getDb();
  const { issueId } = UpdateIssueParams.parse(req.params);
  const body = UpdateIssueBody.parse(req.body);

  const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.labels) update.labels = JSON.stringify(body.labels);

  const [updated] = await db.update(issuesTable).set(update as any).where(eq(issuesTable.id, issueId)).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, updated.projectId));
  const [cnt] = await db.select({ count: sql<number>`count(*)` }).from(commentsTable).where(eq(commentsTable.issueId, issueId));

  res.json({ ...updated, labels: parseLabels(updated.labels), issueKey: issueKey(project?.key ?? "PROJ", updated.issueNumber), commentCount: Number(cnt?.count ?? 0) });
  emitFlowBoardEvent({ type: "issue.updated", issueId: updated.id, projectId: updated.projectId, status: updated.status });
});

router.delete("/issues/:issueId", async (req, res) => {
  const db = getDb();
  const { issueId } = DeleteIssueParams.parse(req.params);
  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId));
  await db.delete(attachmentsTable).where(eq(attachmentsTable.issueId, issueId));
  await db.delete(agentWorklogEntriesTable).where(eq(agentWorklogEntriesTable.issueId, issueId));
  await db.delete(commentsTable).where(eq(commentsTable.issueId, issueId));
  await db.delete(issuesTable).where(eq(issuesTable.id, issueId));
  res.status(204).send();
  emitFlowBoardEvent({ type: "issue.deleted", issueId, projectId: issue?.projectId ?? null });
});

router.get("/issues/:issueId/comments", async (req, res) => {
  const db = getDb();
  const { issueId } = ListCommentsParams.parse(req.params);
  const comments = await db.select().from(commentsTable).where(eq(commentsTable.issueId, issueId)).orderBy(commentsTable.createdAt);
  res.json(comments);
});

router.post("/issues/:issueId/comments", async (req, res) => {
  const db = getDb();
  const { issueId } = CreateCommentParams.parse(req.params);
  const body = CreateCommentBody.parse(req.body);
  const [comment] = await db
    .insert(commentsTable)
    .values({ id: randomUUID(), issueId, content: body.content, author: body.author })
    .returning();
  await db.update(issuesTable).set({ updatedAt: new Date() }).where(eq(issuesTable.id, issueId));
  res.status(201).json(comment);
  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId));
  emitFlowBoardEvent({ type: "comment.created", issueId, projectId: issue?.projectId ?? null });
});

router.delete("/comments/:commentId", async (req, res) => {
  const db = getDb();
  const { commentId } = DeleteCommentParams.parse(req.params);
  await db.delete(commentsTable).where(eq(commentsTable.id, commentId));
  res.status(204).send();
});

router.get("/issues/:issueId/attachments", async (req, res) => {
  const db = getDb();
  const { issueId } = ListAttachmentsParams.parse(req.params);
  const attachments = await db.select().from(attachmentsTable).where(eq(attachmentsTable.issueId, issueId)).orderBy(attachmentsTable.createdAt);
  res.json(attachments);
});

router.post("/issues/:issueId/attachments", async (req, res) => {
  const db = getDb();
  const { issueId } = CreateAttachmentParams.parse(req.params);
  const body = CreateAttachmentBody.parse(req.body);
  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId));
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }

  if (!isAllowedAttachment(body.kind, body.mimeType, body.fileName)) {
    res.status(400).json({ error: "Only PNG, JPEG, WebP, GIF images and .txt files are supported." });
    return;
  }

  const perFileLimit = getAttachmentLimit(body.kind);
  if (body.sizeBytes > perFileLimit) {
    res.status(413).json({ error: body.kind === "image" ? "Images must be 2 MB or smaller." : "Text files must be 256 KB or smaller." });
    return;
  }

  const existing = await db.select().from(attachmentsTable).where(eq(attachmentsTable.issueId, issueId));
  if (existing.length >= MAX_ATTACHMENTS_PER_ISSUE) {
    res.status(400).json({ error: `Each issue can have up to ${MAX_ATTACHMENTS_PER_ISSUE} attachments.` });
    return;
  }

  const totalBytes = existing.reduce((sum, attachment) => sum + attachment.sizeBytes, 0) + body.sizeBytes;
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    res.status(413).json({ error: "Total attachment size for this issue must stay under 8 MB." });
    return;
  }

  const now = new Date();
  const [attachment] = await db.insert(attachmentsTable)
    .values({
      id: randomUUID(),
      issueId,
      fileName: body.fileName.slice(0, 180),
      mimeType: body.mimeType,
      kind: body.kind,
      sizeBytes: body.sizeBytes,
      content: body.content,
      createdAt: now,
    })
    .returning();
  await db.update(issuesTable).set({ updatedAt: now }).where(eq(issuesTable.id, issueId));
  res.status(201).json(attachment);
});

router.delete("/attachments/:attachmentId", async (req, res) => {
  const db = getDb();
  const { attachmentId } = DeleteAttachmentParams.parse(req.params);
  await db.delete(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
  res.status(204).send();
});

export default router;

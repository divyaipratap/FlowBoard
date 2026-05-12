import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { eq, and, ilike, sql } from "drizzle-orm";
import { db, issuesTable, commentsTable, projectsTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

function buildIssueKey(projectKey: string, issueNumber: number) {
  return `${projectKey}-${issueNumber}`;
}

router.get("/projects/:projectId/issues", async (req, res) => {
  const { projectId } = ListIssuesParams.parse(req.params);
  const query = ListIssuesQueryParams.parse(req.query);

  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const projectKey = project[0].key;

  let issues = await db.select().from(issuesTable).where(eq(issuesTable.projectId, projectId));
  if (query.status) issues = issues.filter((i) => i.status === query.status);
  if (query.priority) issues = issues.filter((i) => i.priority === query.priority);
  if (query.type) issues = issues.filter((i) => i.type === query.type);
  if (query.assignee) issues = issues.filter((i) => i.assignee === query.assignee);
  if (query.search) {
    const s = query.search.toLowerCase();
    issues = issues.filter((i) => i.title.toLowerCase().includes(s));
  }

  const commentCounts = await db
    .select({ issueId: commentsTable.issueId, count: sql<number>`count(*)::int` })
    .from(commentsTable)
    .groupBy(commentsTable.issueId);
  const countMap = Object.fromEntries(commentCounts.map((c) => [c.issueId, c.count]));

  const result = issues.map((i) => ({
    ...i,
    issueKey: buildIssueKey(projectKey, i.issueNumber),
    commentCount: countMap[i.id] ?? 0,
    labels: i.labels ?? [],
  }));
  res.json(result);
});

router.post("/projects/:projectId/issues", async (req, res) => {
  const { projectId } = CreateIssueParams.parse(req.params);
  const body = CreateIssueBody.parse(req.body);

  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const projectKey = project[0].key;

  const [maxNum] = await db
    .select({ max: sql<number>`coalesce(max(issue_number), 0)` })
    .from(issuesTable)
    .where(eq(issuesTable.projectId, projectId));
  const issueNumber = (maxNum?.max ?? 0) + 1;

  const issue = await db
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
      labels: body.labels ?? [],
    })
    .returning();

  res.status(201).json({
    ...issue[0],
    issueKey: buildIssueKey(projectKey, issueNumber),
    commentCount: 0,
    labels: issue[0].labels ?? [],
  });
});

router.get("/issues/:issueId", async (req, res) => {
  const { issueId } = GetIssueParams.parse(req.params);
  const issue = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId)).limit(1);
  if (!issue.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, issue[0].projectId)).limit(1);
  const projectKey = project[0]?.key ?? "PROJ";

  const comments = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.issueId, issueId))
    .orderBy(commentsTable.createdAt);

  res.json({
    ...issue[0],
    issueKey: buildIssueKey(projectKey, issue[0].issueNumber),
    commentCount: comments.length,
    labels: issue[0].labels ?? [],
    comments,
  });
});

router.patch("/issues/:issueId", async (req, res) => {
  const { issueId } = UpdateIssueParams.parse(req.params);
  const body = UpdateIssueBody.parse(req.body);

  const existing = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId)).limit(1);
  if (!existing.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const updated = await db
    .update(issuesTable)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(issuesTable.id, issueId))
    .returning();

  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, updated[0].projectId)).limit(1);
  const projectKey = project[0]?.key ?? "PROJ";

  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commentsTable)
    .where(eq(commentsTable.issueId, issueId));

  res.json({
    ...updated[0],
    issueKey: buildIssueKey(projectKey, updated[0].issueNumber),
    commentCount: count?.count ?? 0,
    labels: updated[0].labels ?? [],
  });
});

router.delete("/issues/:issueId", async (req, res) => {
  const { issueId } = DeleteIssueParams.parse(req.params);
  await db.delete(commentsTable).where(eq(commentsTable.issueId, issueId));
  await db.delete(issuesTable).where(eq(issuesTable.id, issueId));
  res.status(204).send();
});

router.get("/issues/:issueId/comments", async (req, res) => {
  const { issueId } = ListCommentsParams.parse(req.params);
  const comments = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.issueId, issueId))
    .orderBy(commentsTable.createdAt);
  res.json(comments);
});

router.post("/issues/:issueId/comments", async (req, res) => {
  const { issueId } = CreateCommentParams.parse(req.params);
  const body = CreateCommentBody.parse(req.body);
  const comment = await db
    .insert(commentsTable)
    .values({ id: randomUUID(), issueId, content: body.content, author: body.author })
    .returning();
  await db.update(issuesTable).set({ updatedAt: new Date() }).where(eq(issuesTable.id, issueId));
  res.status(201).json(comment[0]);
});

router.delete("/comments/:commentId", async (req, res) => {
  const { commentId } = DeleteCommentParams.parse(req.params);
  await db.delete(commentsTable).where(eq(commentsTable.id, commentId));
  res.status(204).send();
});

export default router;

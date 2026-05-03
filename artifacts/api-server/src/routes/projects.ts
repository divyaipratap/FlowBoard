import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db, projectsTable, issuesTable } from "@workspace/db";
import {
  CreateProjectBody,
  UpdateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  DeleteProjectParams,
  GetProjectSummaryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects", async (req, res) => {
  const projects = await db.select().from(projectsTable).orderBy(projectsTable.createdAt);
  const counts = await db
    .select({ projectId: issuesTable.projectId, count: sql<number>`count(*)::int` })
    .from(issuesTable)
    .groupBy(issuesTable.projectId);
  const countMap = Object.fromEntries(counts.map((c) => [c.projectId, c.count]));
  const result = projects.map((p) => ({ ...p, issueCount: countMap[p.id] ?? 0 }));
  res.json(result);
});

router.post("/projects", async (req, res) => {
  const body = CreateProjectBody.parse(req.body);
  const project = await db
    .insert(projectsTable)
    .values({ id: randomUUID(), name: body.name, key: body.key.toUpperCase(), description: body.description, color: body.color ?? "#8b5cf6" })
    .returning();
  res.status(201).json({ ...project[0], issueCount: 0 });
});

router.get("/projects/:projectId", async (req, res) => {
  const { projectId } = GetProjectParams.parse(req.params);
  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project.length) return res.status(404).json({ error: "Not found" });
  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issuesTable)
    .where(eq(issuesTable.projectId, projectId));
  res.json({ ...project[0], issueCount: count?.count ?? 0 });
});

router.patch("/projects/:projectId", async (req, res) => {
  const { projectId } = UpdateProjectParams.parse(req.params);
  const body = UpdateProjectBody.parse(req.body);
  const updated = await db
    .update(projectsTable)
    .set({ name: body.name, description: body.description, color: body.color })
    .where(eq(projectsTable.id, projectId))
    .returning();
  if (!updated.length) return res.status(404).json({ error: "Not found" });
  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issuesTable)
    .where(eq(issuesTable.projectId, projectId));
  res.json({ ...updated[0], issueCount: count?.count ?? 0 });
});

router.delete("/projects/:projectId", async (req, res) => {
  const { projectId } = DeleteProjectParams.parse(req.params);
  await db.delete(issuesTable).where(eq(issuesTable.projectId, projectId));
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  res.status(204).send();
});

router.get("/projects/:projectId/summary", async (req, res) => {
  const { projectId } = GetProjectSummaryParams.parse(req.params);
  const issues = await db.select().from(issuesTable).where(eq(issuesTable.projectId, projectId));
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const issue of issues) {
    byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
    byPriority[issue.priority] = (byPriority[issue.priority] ?? 0) + 1;
    byType[issue.type] = (byType[issue.type] ?? 0) + 1;
  }
  const recentActivity = issues
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5)
    .map((i) => ({
      ...i,
      issueKey: `${i.projectId.slice(0, 4).toUpperCase()}-${i.issueNumber}`,
      commentCount: 0,
    }));
  res.json({ projectId, totalIssues: issues.length, byStatus, byPriority, byType, recentActivity });
});

export default router;

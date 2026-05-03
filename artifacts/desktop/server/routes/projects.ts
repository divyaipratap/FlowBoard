import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { projectsTable, issuesTable } from "../schema";
import {
  CreateProjectBody,
  UpdateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  DeleteProjectParams,
  GetProjectSummaryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseLabels(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return []; }
}

router.get("/projects", async (_req, res) => {
  const db = getDb();
  const projects = await db.select().from(projectsTable).orderBy(projectsTable.createdAt);
  const counts = await db
    .select({ projectId: issuesTable.projectId, count: sql<number>`count(*)` })
    .from(issuesTable)
    .groupBy(issuesTable.projectId);
  const countMap = Object.fromEntries(counts.map((c) => [c.projectId, Number(c.count)]));
  res.json(projects.map((p) => ({ ...p, issueCount: countMap[p.id] ?? 0 })));
});

router.post("/projects", async (req, res) => {
  const db = getDb();
  const body = CreateProjectBody.parse(req.body);
  const [project] = await db
    .insert(projectsTable)
    .values({ id: randomUUID(), name: body.name, key: body.key.toUpperCase(), description: body.description, color: body.color ?? "#8b5cf6" })
    .returning();
  res.status(201).json({ ...project, issueCount: 0 });
});

router.get("/projects/:projectId", async (req, res) => {
  const db = getDb();
  const { projectId } = GetProjectParams.parse(req.params);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) return res.status(404).json({ error: "Not found" });
  const [cnt] = await db.select({ count: sql<number>`count(*)` }).from(issuesTable).where(eq(issuesTable.projectId, projectId));
  res.json({ ...project, issueCount: Number(cnt?.count ?? 0) });
});

router.patch("/projects/:projectId", async (req, res) => {
  const db = getDb();
  const { projectId } = UpdateProjectParams.parse(req.params);
  const body = UpdateProjectBody.parse(req.body);
  const [updated] = await db
    .update(projectsTable)
    .set({ name: body.name, description: body.description, color: body.color })
    .where(eq(projectsTable.id, projectId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  const [cnt] = await db.select({ count: sql<number>`count(*)` }).from(issuesTable).where(eq(issuesTable.projectId, projectId));
  res.json({ ...updated, issueCount: Number(cnt?.count ?? 0) });
});

router.delete("/projects/:projectId", async (req, res) => {
  const db = getDb();
  const { projectId } = DeleteProjectParams.parse(req.params);
  await db.delete(issuesTable).where(eq(issuesTable.projectId, projectId));
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  res.status(204).send();
});

router.get("/projects/:projectId/summary", async (req, res) => {
  const db = getDb();
  const { projectId } = GetProjectSummaryParams.parse(req.params);
  const issues = await db.select().from(issuesTable).where(eq(issuesTable.projectId, projectId));
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const i of issues) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    byPriority[i.priority] = (byPriority[i.priority] ?? 0) + 1;
    byType[i.type] = (byType[i.type] ?? 0) + 1;
  }
  const recent = issues
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .slice(0, 5)
    .map((i) => ({ ...i, labels: parseLabels(i.labels), issueKey: `${i.projectId.slice(0, 4).toUpperCase()}-${i.issueNumber}`, commentCount: 0 }));
  res.json({ projectId, totalIssues: issues.length, byStatus, byPriority, byType, recentActivity: recent });
});

export default router;

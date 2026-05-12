import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { attachmentsTable, commentsTable, issuesTable, projectStatusesTable, projectsTable } from "../schema";
import {
  CreateProjectBody,
  UpdateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  DeleteProjectParams,
  GetProjectSummaryParams,
  ListProjectStatusesParams,
  UpdateProjectStatusesParams,
  UpdateProjectStatusesBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_STATUSES = [
  { name: "todo", color: "#6b7280", position: 0 },
  { name: "in_progress", color: "#3b82f6", position: 1 },
  { name: "in_review", color: "#eab308", position: 2 },
  { name: "done", color: "#22c55e", position: 3 },
];

function parseLabels(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return []; }
}

async function ensureProjectStatuses(projectId: string) {
  const db = getDb();
  const existing = await db.select().from(projectStatusesTable).where(eq(projectStatusesTable.projectId, projectId)).orderBy(projectStatusesTable.position);
  if (existing.length > 0) return existing;
  await db.insert(projectStatusesTable).values(DEFAULT_STATUSES.map((status) => ({
    id: randomUUID(),
    projectId,
    ...status,
  })));
  return db.select().from(projectStatusesTable).where(eq(projectStatusesTable.projectId, projectId)).orderBy(projectStatusesTable.position);
}

async function replaceProjectStatuses(projectId: string, statuses: Array<{ id?: string; name: string; color: string; position: number }>) {
  const db = getDb();
  const existing = await ensureProjectStatuses(projectId);
  const existingById = new Map(existing.map((status) => [status.id, status]));
  const normalized = statuses
    .map((status, index) => ({
      id: status.id || randomUUID(),
      name: status.name.trim(),
      color: status.color || "#6b7280",
      position: Number.isFinite(status.position) ? status.position : index,
    }))
    .filter((status) => status.name.length > 0)
    .slice(0, 8);

  if (normalized.length === 0) {
    normalized.push({ id: randomUUID(), name: "todo", color: "#6b7280", position: 0 });
  }

  const fallbackName = normalized[0].name;
  for (const status of normalized) {
    const previous = existingById.get(status.id);
    if (previous && previous.name !== status.name) {
      await db.update(issuesTable).set({ status: status.name, updatedAt: new Date() }).where(and(eq(issuesTable.projectId, projectId), eq(issuesTable.status, previous.name)));
    }
  }

  const nextNames = new Set(normalized.map((status) => status.name));
  for (const previous of existing) {
    if (!nextNames.has(previous.name) && !normalized.some((status) => status.id === previous.id)) {
      await db.update(issuesTable).set({ status: fallbackName, updatedAt: new Date() }).where(and(eq(issuesTable.projectId, projectId), eq(issuesTable.status, previous.name)));
    }
  }

  await db.delete(projectStatusesTable).where(eq(projectStatusesTable.projectId, projectId));
  await db.insert(projectStatusesTable).values(normalized.map((status, index) => ({
    id: status.id,
    projectId,
    name: status.name,
    color: status.color,
    position: index,
  })));

  return ensureProjectStatuses(projectId);
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
  await replaceProjectStatuses(project.id, body.statuses?.length ? body.statuses : DEFAULT_STATUSES);
  res.status(201).json({ ...project, issueCount: 0 });
});

router.get("/projects/:projectId", async (req, res) => {
  const db = getDb();
  const { projectId } = GetProjectParams.parse(req.params);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
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
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [cnt] = await db.select({ count: sql<number>`count(*)` }).from(issuesTable).where(eq(issuesTable.projectId, projectId));
  res.json({ ...updated, issueCount: Number(cnt?.count ?? 0) });
});

router.delete("/projects/:projectId", async (req, res) => {
  const db = getDb();
  const { projectId } = DeleteProjectParams.parse(req.params);
  const issues = await db.select({ id: issuesTable.id }).from(issuesTable).where(eq(issuesTable.projectId, projectId));
  const issueIds = issues.map((issue) => issue.id);
  if (issueIds.length > 0) {
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.issueId, issueIds));
    await db.delete(commentsTable).where(inArray(commentsTable.issueId, issueIds));
  }
  await db.delete(issuesTable).where(eq(issuesTable.projectId, projectId));
  await db.delete(projectStatusesTable).where(eq(projectStatusesTable.projectId, projectId));
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  res.status(204).send();
});

router.get("/projects/:projectId/statuses", async (req, res) => {
  const { projectId } = ListProjectStatusesParams.parse(req.params);
  res.json(await ensureProjectStatuses(projectId));
});

router.put("/projects/:projectId/statuses", async (req, res) => {
  const { projectId } = UpdateProjectStatusesParams.parse(req.params);
  const body = UpdateProjectStatusesBody.parse(req.body);
  res.json(await replaceProjectStatuses(projectId, body.statuses));
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

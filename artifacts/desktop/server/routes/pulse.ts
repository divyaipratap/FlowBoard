import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { dailyReviewsTable, flowSessionsTable, issueSignalsTable } from "../schema";
import { computePulseToday, getIssueProject, recomputePulse } from "../pulse/compute";
import {
  SaveDailyReviewBody,
  StartFlowSessionBody,
  StopFlowSessionParams,
  StopFlowSessionBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseIdList(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function serializeSession(session: typeof flowSessionsTable.$inferSelect) {
  return session;
}

function serializeReview(review: typeof dailyReviewsTable.$inferSelect) {
  return {
    ...review,
    completedIssueIds: parseIdList(review.completedIssueIds),
    carriedIssueIds: parseIdList(review.carriedIssueIds),
  };
}

router.get("/pulse/today", async (_req, res) => {
  res.json(await computePulseToday());
});

router.post("/pulse/recompute", async (_req, res) => {
  res.json(await recomputePulse());
});

router.post("/flow-sessions/start", async (req, res) => {
  const db = getDb();
  const body = StartFlowSessionBody.parse(req.body);
  const issueProject = await getIssueProject(body.issueId);
  if (!issueProject) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }

  const now = new Date();
  const [session] = await db.insert(flowSessionsTable)
    .values({
      id: randomUUID(),
      issueId: body.issueId,
      projectId: issueProject.projectId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(issueSignalsTable)
    .values({
      issueId: body.issueId,
      lastStartedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: issueSignalsTable.issueId,
      set: {
        lastStartedAt: now,
        updatedAt: now,
      },
    });

  res.json({ session: serializeSession(session) });
});

router.post("/flow-sessions/:id/stop", async (req, res) => {
  const db = getDb();
  const { id } = StopFlowSessionParams.parse(req.params);
  const body = StopFlowSessionBody.parse(req.body || {});
  const now = new Date();

  const [session] = await db.update(flowSessionsTable)
    .set({ endedAt: now, note: body.note, updatedAt: now })
    .where(eq(flowSessionsTable.id, id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({ session: serializeSession(session) });
});

router.post("/daily-review", async (req, res) => {
  const db = getDb();
  const body = SaveDailyReviewBody.parse(req.body);
  const now = new Date();
  const completedIssueIds = JSON.stringify(body.completedIssueIds || []);
  const carriedIssueIds = JSON.stringify(body.carriedIssueIds || []);
  const existing = await db.select().from(dailyReviewsTable).where(eq(dailyReviewsTable.date, body.date));

  const [review] = existing[0]
    ? await db.update(dailyReviewsTable)
      .set({
        summary: body.summary,
        completedIssueIds,
        carriedIssueIds,
        updatedAt: now,
      })
      .where(eq(dailyReviewsTable.date, body.date))
      .returning()
    : await db.insert(dailyReviewsTable)
      .values({
        id: randomUUID(),
        date: body.date,
        summary: body.summary,
        completedIssueIds,
        carriedIssueIds,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

  res.json({ review: serializeReview(review) });
});

export default router;

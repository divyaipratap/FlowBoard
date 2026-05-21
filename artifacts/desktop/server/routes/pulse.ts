import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { dailyReviewsTable, flowSessionsTable, issueSignalsTable } from "../schema";
import { computePulseToday, getIssueProject, recomputePulse } from "../pulse/compute";
import {
  createPulseRecipe,
  deletePulseRecipe,
  executeRecipe,
  getPulseGlobalState,
  getPulseRecipe,
  listPulseRecipeRuns,
  listPulseRecipes,
  setPulseGlobalPaused,
  updatePulseRecipe,
} from "../pulse/recipes";
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

router.get("/pulse/recipes", async (_req, res) => {
  const [recipes, global] = await Promise.all([listPulseRecipes(), getPulseGlobalState()]);
  res.json({ recipes, global });
});

router.post("/pulse/recipes", async (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const recipe = await createPulseRecipe({
    name,
    description: typeof body.description === "string" ? body.description : null,
    enabled: typeof body.enabled === "boolean" ? body.enabled : true,
    agentName: typeof body.agentName === "string" ? body.agentName : undefined,
    selector: body.selector,
    scheduleExpr: typeof body.scheduleExpr === "string" ? body.scheduleExpr : undefined,
    rules: body.rules,
    proposal: body.proposal,
  });
  res.json({ recipe });
});

router.get("/pulse/recipes/:id", async (req, res) => {
  const recipe = await getPulseRecipe(req.params.id);
  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }
  res.json({ recipe });
});

router.patch("/pulse/recipes/:id", async (req, res) => {
  try {
    const recipe = await updatePulseRecipe(req.params.id, req.body || {});
    res.json({ recipe });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Update failed" });
  }
});

router.delete("/pulse/recipes/:id", async (req, res) => {
  await deletePulseRecipe(req.params.id);
  res.json({ ok: true });
});

router.post("/pulse/recipes/:id/run", async (req, res) => {
  try {
    const run = await executeRecipe(req.params.id, "manual");
    res.json({ run });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Run failed" });
  }
});

router.get("/pulse/runs", async (req, res) => {
  const recipeId = typeof req.query.recipeId === "string" ? req.query.recipeId : undefined;
  const limit = Number(req.query.limit ?? 30);
  const runs = await listPulseRecipeRuns(recipeId, Number.isFinite(limit) ? limit : 30);
  res.json({ runs });
});

router.get("/pulse/global", async (_req, res) => {
  const global = await getPulseGlobalState();
  res.json({ global });
});

router.post("/pulse/global", async (req, res) => {
  const body = (req.body || {}) as { paused?: unknown };
  const paused = typeof body.paused === "boolean" ? body.paused : false;
  const global = await setPulseGlobalPaused(paused);
  res.json({ global });
});

export default router;

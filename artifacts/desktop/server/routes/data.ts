import { Router, type IRouter } from "express";
import { getDb } from "../db";
import {
  attachmentsTable,
  commentsTable,
  dailyReviewsTable,
  flowSessionsTable,
  issueSignalsTable,
  issuesTable,
  projectStatusesTable,
  projectsTable,
} from "../schema";

const router: IRouter = Router();

router.delete("/data", async (_req, res) => {
  const db = getDb();
  await db.delete(attachmentsTable);
  await db.delete(commentsTable);
  await db.delete(flowSessionsTable);
  await db.delete(issueSignalsTable);
  await db.delete(dailyReviewsTable);
  await db.delete(issuesTable);
  await db.delete(projectStatusesTable);
  await db.delete(projectsTable);
  res.status(204).send();
});

export default router;

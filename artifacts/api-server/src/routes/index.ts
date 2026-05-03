import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import issuesRouter from "./issues";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(issuesRouter);

export default router;

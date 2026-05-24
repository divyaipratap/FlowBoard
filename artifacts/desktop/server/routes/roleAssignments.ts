// FAB-12 — HTTP routes for issue role assignments.
//
//   GET    /api/issues/:issueId/role-assignments          — list assignments
//   POST   /api/issues/:issueId/role-assignments          — add assignment
//   PATCH  /api/role-assignments/:id                      — update status/notes
//   DELETE /api/role-assignments/:id                      — remove
//   POST   /api/role-assignments/:id/handoff              — finish + advance

import { Router, type IRouter } from "express";
import {
  advanceHandoff,
  createAssignment,
  deleteAssignment,
  listAssignmentsForIssue,
  updateAssignmentStatus,
} from "../orchestration/assignments";
import { isRole, isRoleStatus, ROLES, ROLE_STATUSES } from "../orchestration/roles";

const router: IRouter = Router();

router.get("/issues/:issueId/role-assignments", async (req, res) => {
  try {
    const rows = await listAssignmentsForIssue(req.params.issueId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post("/issues/:issueId/role-assignments", async (req, res) => {
  const body = req.body as { agentName?: string; role?: string; notes?: string | null } | undefined;
  if (!body?.agentName || !body.role) {
    res.status(400).json({ error: "agentName and role are required" });
    return;
  }
  if (!isRole(body.role)) {
    res.status(400).json({ error: `role must be one of ${ROLES.join(", ")}` });
    return;
  }
  try {
    const row = await createAssignment({
      issueId: req.params.issueId,
      agentName: body.agentName,
      role: body.role,
      notes: body.notes ?? null,
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.patch("/role-assignments/:id", async (req, res) => {
  const body = req.body as { status?: string; notes?: string | null } | undefined;
  if (!body?.status) {
    res.status(400).json({ error: "status is required" });
    return;
  }
  if (!isRoleStatus(body.status)) {
    res.status(400).json({ error: `status must be one of ${ROLE_STATUSES.join(", ")}` });
    return;
  }
  try {
    const row = await updateAssignmentStatus(req.params.id, body.status, body.notes ?? null);
    if (!row) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.delete("/role-assignments/:id", async (req, res) => {
  try {
    const ok = await deleteAssignment(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post("/role-assignments/:id/handoff", async (req, res) => {
  const body = req.body as { pass?: boolean; notes?: string | null } | undefined;
  if (typeof body?.pass !== "boolean") {
    res.status(400).json({ error: "pass (boolean) is required" });
    return;
  }
  try {
    const result = await advanceHandoff({ assignmentId: req.params.id, pass: body.pass, notes: body.notes ?? null });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default router;

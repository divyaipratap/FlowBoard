import { Router, type IRouter } from "express";
import {
  approveAgentInboxProposal,
  getAgentBridgeSettings,
  getAgentBridgeStatus,
  listAgentInboxProposals,
  listAgentAuditLog,
  listAgentWorklogEntries,
  mergeAgentInboxProposal,
  rejectAgentInboxProposal,
  runFlowBoardTool,
  updateAgentInboxProposal,
  updateAgentBridgeSettings,
} from "../agentBridge";
import { createMcpConfig } from "../mcpConfig";

const router: IRouter = Router();

router.get("/agent-bridge/status", async (_req, res) => {
  res.json(await getAgentBridgeStatus());
});

router.get("/agent-bridge/settings", async (_req, res) => {
  res.json(await getAgentBridgeSettings());
});

router.put("/agent-bridge/settings", async (req, res) => {
  const body = req.body ?? {};
  res.json(await updateAgentBridgeSettings({
    permissionMode: body.permissionMode,
    allowedAgents: Array.isArray(body.allowedAgents) ? body.allowedAgents.map(String) : undefined,
    disableWrites: typeof body.disableWrites === "boolean" ? body.disableWrites : undefined,
    permissions: body.permissions && typeof body.permissions === "object" ? body.permissions : undefined,
  }));
});

router.get("/agent-bridge/audit-log", async (req, res) => {
  res.json(await listAgentAuditLog(Number(req.query.limit ?? 30)));
});

router.get("/issues/:issueId/agent-worklog", async (req, res) => {
  try {
    res.json(await listAgentWorklogEntries(req.params.issueId));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/agent-bridge/inbox", async (req, res) => {
  res.json(await listAgentInboxProposals(String(req.query.status ?? "pending"), Number(req.query.limit ?? 30)));
});

router.patch("/agent-bridge/inbox/:proposalId", async (req, res) => {
  try {
    res.json(await updateAgentInboxProposal(req.params.proposalId, {
      title: typeof req.body?.title === "string" ? req.body.title : undefined,
      description: typeof req.body?.description === "string" || req.body?.description === null ? req.body.description : undefined,
      payload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : undefined,
    }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/agent-bridge/inbox/:proposalId/approve", async (req, res) => {
  try {
    res.json(await approveAgentInboxProposal(req.params.proposalId));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/agent-bridge/inbox/:proposalId/reject", async (req, res) => {
  try {
    res.json(await rejectAgentInboxProposal(req.params.proposalId));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/agent-bridge/inbox/:proposalId/merge", async (req, res) => {
  try {
    res.json(await mergeAgentInboxProposal(req.params.proposalId, String(req.body?.issueId ?? req.body?.issueKey ?? "")));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/agent-bridge/mcp-config", async (_req, res) => {
  res.json(createMcpConfig());
});

router.post("/agent-bridge/tools/:toolName", async (req, res) => {
  try {
    res.json(await runFlowBoardTool(req.params.toolName, req.body ?? {}, { agentName: req.body?.agentName }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;

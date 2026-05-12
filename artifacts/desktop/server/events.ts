import { Router, type IRouter, type Response } from "express";

export type FlowBoardEvent = {
  type: "issue.created" | "issue.updated" | "issue.deleted" | "comment.created" | "proposal.changed" | "project.changed";
  issueId?: string | null;
  projectId?: string | null;
  status?: string;
};

const clients = new Set<Response>();

export const eventsRouter: IRouter = Router();

eventsRouter.get("/events", (req, res) => {
  res.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: flowboard\ndata: ${JSON.stringify({ type: "connected" })}\n\n`);
  clients.add(res);

  req.on("close", () => {
    clients.delete(res);
  });
});

export function emitFlowBoardEvent(event: FlowBoardEvent) {
  const data = JSON.stringify({ ...event, emittedAt: new Date().toISOString() });
  for (const client of clients) {
    client.write(`event: flowboard\ndata: ${data}\n\n`);
  }
}

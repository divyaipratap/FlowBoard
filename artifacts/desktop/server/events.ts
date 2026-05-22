import { Router, type IRouter, type Response } from "express";

export type FlowBoardEvent = {
  type:
    | "issue.created"
    | "issue.updated"
    | "issue.deleted"
    | "comment.created"
    | "proposal.changed"
    | "project.changed"
    // FAB-15: team sync.
    | "sync.status_conflict"
    | "sync.peer_connected"
    | "sync.peer_disconnected"
    | "sync.transport_state";
  issueId?: string | null;
  projectId?: string | null;
  status?: string;
  // FAB-15: payload for sync.status_conflict — surfaced to the StatusConflictDialog (Track C).
  conflict?: {
    issueId: string;
    mine: { status: string; at: string };
    theirs: { status: string; at: string; peerId: string };
  };
  // FAB-15: payload for sync.transport_state — feeds the Settings sync indicator (Track C).
  transportState?: "idle" | "connecting" | "connected" | "disconnected" | "error";
  // FAB-15: payload for sync.peer_* events.
  peerId?: string;
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

import React, { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

/**
 * Payload shape for a sync.status_conflict SSE event.
 * Matches the FlowBoardEvent.conflict type defined in events.ts (Track A).
 */
export interface StatusConflict {
  issueId: string;
  mine: { status: string; at: string };
  theirs: { status: string; at: string; peerId: string };
}

/**
 * StatusConflictDialog — shown when two peers change the same issue's status
 * within a short window and the CRDT can't auto-resolve (status is a scalar
 * last-writer-wins field, so we surface the conflict to the user).
 *
 * Resolution options:
 *   - Keep mine: local status wins, broadcast to peers.
 *   - Accept theirs: remote status wins, apply locally.
 *
 * Mounted globally from App.tsx. Listens for "flowboard:sync-conflict" custom events.
 */
export function StatusConflictDialog() {
  const [conflict, setConflict] = useState<StatusConflict | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        conflict?: StatusConflict;
      } | undefined;

      if (detail?.type === "sync.status_conflict" && detail.conflict) {
        setConflict(detail.conflict);
        setOpen(true);
      }
    };

    window.addEventListener("flowboard:sync-conflict", handler);
    return () => window.removeEventListener("flowboard:sync-conflict", handler);
  }, []);

  const resolve = useCallback(
    async (choice: "mine" | "theirs") => {
      if (!conflict) return;
      try {
        await fetch("/api/sync/resolve-conflict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            issueId: conflict.issueId,
            chosenStatus: choice === "mine" ? conflict.mine.status : conflict.theirs.status,
          }),
        });
      } catch {
        // Best-effort — the engine will reconcile on next sync round.
      }
      setOpen(false);
      setConflict(null);
    },
    [conflict],
  );

  if (!conflict) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setOpen(false); setConflict(null); } }}>
      <DialogContent className="glass-panel sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-yellow-400">
            <AlertTriangle size={18} />
            Status conflict
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Two team members changed the status of the same issue at nearly the same time.
            Choose which status to keep.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Mine */}
            <div className="rounded-md border border-border/70 bg-background/35 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your change</p>
              <Badge variant="default" className="text-sm">{conflict.mine.status}</Badge>
              <p className="text-xs text-muted-foreground">
                {new Date(conflict.mine.at).toLocaleTimeString()}
              </p>
            </div>

            {/* Theirs */}
            <div className="rounded-md border border-border/70 bg-background/35 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Their change</p>
              <Badge variant="secondary" className="text-sm">{conflict.theirs.status}</Badge>
              <p className="text-xs text-muted-foreground">
                Peer {conflict.theirs.peerId.slice(0, 8)}… at {new Date(conflict.theirs.at).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => resolve("theirs")}>
            Accept theirs
          </Button>
          <Button onClick={() => resolve("mine")}>
            Keep mine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState } from "react";
import { Bell, ExternalLink, Bot, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useAgentInbox, type AgentProposal } from "@/contexts/AgentInboxContext";

function timeAgo(ts: AgentProposal["createdAt"]): string {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return "";
  }
}

export const NotificationBell = () => {
  const { proposals, count, loading, approve, reject } = useAgentInbox();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handle = async (id: string, kind: "approve" | "reject") => {
    setBusyId(id);
    try {
      if (kind === "approve") await approve(id);
      else await reject(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${count} pending agent proposal${count === 1 ? "" : "s"}`}
          className="glass-card relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
        >
          <Bell size={16} />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="glass-panel z-50 w-96 max-h-[28rem] overflow-hidden border border-white/10 bg-background/95 p-0 text-foreground"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Agent proposals</p>
            <p className="text-[11px] text-muted-foreground">
              {loading ? "Loading…" : count === 0 ? "Inbox clear" : `${count} pending`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-white"
            onClick={() => {
              setOpen(false);
              setLocation("/settings");
            }}
          >
            <ExternalLink size={12} className="mr-1" />
            Inbox
          </Button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {count === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              {loading ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                <>No pending proposals.<br />Agent activity will surface here.</>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {proposals.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{p.title}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Bot size={11} className="text-amber-300" />
                        <span className="truncate">{p.agentName}</span>
                        <span>·</span>
                        <span>{timeAgo(p.createdAt)}</span>
                      </p>
                      {p.description ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">
                          {p.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={busyId === p.id}
                        className="h-7 px-2 text-[11px]"
                        onClick={() => void handle(p.id, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === p.id}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-white"
                        onClick={() => void handle(p.id, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

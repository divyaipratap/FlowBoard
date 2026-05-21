import React, { useState } from "react";
import { Bot, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentInbox } from "@/contexts/AgentInboxContext";

interface IssueProposalBannerProps {
  issueId: string;
}

export const IssueProposalBanner = ({ issueId }: IssueProposalBannerProps) => {
  const { proposals, approve, reject } = useAgentInbox();
  const [busyId, setBusyId] = useState<string | null>(null);
  const forIssue = proposals.filter((p) => p.issueId === issueId);
  if (forIssue.length === 0) return null;

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
    <div className="glass-card rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
        <AlertCircle size={14} />
        {forIssue.length} pending agent proposal{forIssue.length === 1 ? "" : "s"} on this issue
      </div>
      <ul className="mt-2 space-y-2">
        {forIssue.map((p) => (
          <li
            key={p.id}
            className="flex items-start justify-between gap-3 rounded-md border border-white/5 bg-black/30 p-2"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-white">
                <Bot size={12} className="text-amber-300" />
                <span className="truncate">{p.title}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {p.agentName} · {p.action || p.toolName}
              </p>
              {p.description ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">{p.description}</p>
              ) : null}
            </div>
            <div className="flex gap-1.5">
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
          </li>
        ))}
      </ul>
    </div>
  );
};

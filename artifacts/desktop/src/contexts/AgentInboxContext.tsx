import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isMutedForKind, loadNotificationPrefs, NOTIFICATION_PREFS_EVENT } from "@/lib/notification-prefs";

export type AgentProposal = {
  id: string;
  agentName: string;
  toolName: string;
  proposalType: string;
  action: string;
  status: string;
  title: string;
  description?: string | null;
  issueId: string | null;
  projectId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string | number;
};

type AgentInboxContextValue = {
  proposals: AgentProposal[];
  count: number;
  loading: boolean;
  refresh: () => Promise<void>;
  approve: (proposalId: string) => Promise<boolean>;
  reject: (proposalId: string) => Promise<boolean>;
};

const AgentInboxContext = createContext<AgentInboxContextValue | null>(null);

const POLL_MS = 30_000;

async function fetchInbox(): Promise<AgentProposal[]> {
  const res = await fetch("/api/agent-bridge/inbox?status=pending&limit=50");
  if (!res.ok) throw new Error("inbox fetch failed");
  const body = await res.json();
  return Array.isArray(body) ? (body as AgentProposal[]) : [];
}

export function AgentInboxProvider({ children }: { children: React.ReactNode }) {
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);
  const seen = useRef<Set<string>>(new Set());

  const approve = useCallback(async (proposalId: string) => {
    try {
      const res = await fetch(`/api/agent-bridge/inbox/${proposalId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("approve failed");
      toast.success("Proposal approved");
      return true;
    } catch {
      toast.error("Failed to approve proposal");
      return false;
    }
  }, []);

  const reject = useCallback(async (proposalId: string) => {
    try {
      const res = await fetch(`/api/agent-bridge/inbox/${proposalId}/reject`, { method: "POST" });
      if (!res.ok) throw new Error("reject failed");
      toast.success("Proposal rejected");
      return true;
    } catch {
      toast.error("Failed to reject proposal");
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchInbox();
      const prefs = loadNotificationPrefs();
      const newOnes: AgentProposal[] = [];
      if (initialized.current) {
        for (const p of next) {
          if (!seen.current.has(p.id)) newOnes.push(p);
        }
      }
      seen.current = new Set(next.map((p) => p.id));
      initialized.current = true;
      setProposals(next);
      setLoading(false);

      for (const p of newOnes) {
        if (isMutedForKind(prefs, p.proposalType)) continue;
        toast(`${p.agentName}: ${p.title}`, {
          description: p.description ?? p.action ?? p.toolName,
          duration: 12000,
          action: {
            label: "Approve",
            onClick: () => { void approve(p.id); },
          },
          cancel: {
            label: "Reject",
            onClick: () => { void reject(p.id); },
          },
        });
      }
    } catch {
      setLoading(false);
    }
  }, [approve, reject]);

  useEffect(() => {
    void refresh();
    const onChange = () => { void refresh(); };
    window.addEventListener("flowboard:agent-bridge-changed", onChange);
    window.addEventListener(NOTIFICATION_PREFS_EVENT, onChange);
    const interval = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      window.removeEventListener("flowboard:agent-bridge-changed", onChange);
      window.removeEventListener(NOTIFICATION_PREFS_EVENT, onChange);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const value: AgentInboxContextValue = {
    proposals,
    count: proposals.length,
    loading,
    refresh,
    approve,
    reject,
  };

  return <AgentInboxContext.Provider value={value}>{children}</AgentInboxContext.Provider>;
}

export function useAgentInbox(): AgentInboxContextValue {
  const value = useContext(AgentInboxContext);
  if (!value) throw new Error("useAgentInbox must be used within AgentInboxProvider");
  return value;
}

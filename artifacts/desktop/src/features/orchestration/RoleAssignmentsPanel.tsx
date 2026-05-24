import React, { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetIssueQueryKey } from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Plus, Trash2, UserPlus2, X } from "lucide-react";
import { getAvatarColors, getInitials } from "@/lib/profile";
import type { RoleAssignment } from "./RoleAssignmentAvatars";

const ROLES: RoleAssignment["role"][] = ["implementer", "reviewer", "tester", "planner"];
const ROLE_LABELS: Record<RoleAssignment["role"], string> = {
  implementer: "Implementer",
  reviewer: "Reviewer",
  tester: "Tester",
  planner: "Planner",
};
const STATUS_VARIANT: Record<RoleAssignment["status"], "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  ready: "secondary",
  in_progress: "default",
  done: "default",
  rejected: "destructive",
};

function colorForAgent(name: string): string {
  const palette = getAvatarColors();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export interface RoleAssignmentsPanelProps {
  issueId: string;
}

export function RoleAssignmentsPanel({ issueId }: RoleAssignmentsPanelProps) {
  const queryClient = useQueryClient();
  const [agentName, setAgentName] = useState("");
  const [role, setRole] = useState<RoleAssignment["role"]>("implementer");

  const { data: assignments = [], refetch } = useQuery({
    queryKey: ["/api/issues", issueId, "role-assignments"],
    queryFn: async () => {
      const res = await fetch(`/api/issues/${issueId}/role-assignments`);
      if (!res.ok) throw new Error("Failed to load assignments");
      return (await res.json()) as RoleAssignment[];
    },
    enabled: !!issueId,
  });

  const refresh = useCallback(() => {
    void refetch();
    queryClient.invalidateQueries({ queryKey: getGetIssueQueryKey(issueId) });
  }, [refetch, queryClient, issueId]);

  const onAdd = useCallback(async () => {
    const name = agentName.trim();
    if (!name) {
      toast.error("Enter an agent name");
      return;
    }
    try {
      const res = await fetch(`/api/issues/${issueId}/role-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: name, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      setAgentName("");
      toast.success(`Assigned ${name} as ${ROLE_LABELS[role]}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [agentName, role, issueId, refresh]);

  const onRemove = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/role-assignments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [refresh]);

  const onHandoff = useCallback(async (id: string, pass: boolean) => {
    try {
      const res = await fetch(`/api/role-assignments/${id}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const body = await res.json() as {
        nextAssignment?: RoleAssignment | null;
        readyToAutoComplete?: boolean;
      };
      if (body.readyToAutoComplete) {
        toast.success("All roles passed and WorkProof is green — issue can auto-complete.");
      } else if (body.nextAssignment) {
        toast.success(`Handed off to ${body.nextAssignment.agentName} (${ROLE_LABELS[body.nextAssignment.role]})`);
      } else {
        toast.success(pass ? "Marked done" : "Rejected");
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus2 size={16} />
        <h3 className="text-sm font-semibold">Roles</h3>
        {assignments.length > 0 && (
          <Badge variant="outline" className="text-[10px]">{assignments.length} assignment{assignments.length === 1 ? "" : "s"}</Badge>
        )}
      </div>

      <div className="rounded-lg border border-border/70 bg-background/35 p-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Assign agents to specific roles. The reviewer can read and comment, but can't change status. The implementer keeps the
          full surface. After each role's work summary lands, the next role in the chain is marked ready automatically.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="Agent name (Codex, Claude, Ollama…)"
            className="flex-1 min-w-[200px]"
          />
          <Select value={role} onValueChange={(v) => setRole(v as RoleAssignment["role"])}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={onAdd} className="gap-1">
            <Plus size={14} />
            Assign
          </Button>
        </div>
      </div>

      {assignments.length === 0 ? (
        <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
          No agent assignments yet. Add one above to set up the handoff chain.
        </p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <div key={a.id} className="rounded-md border border-border/70 bg-background/35 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: colorForAgent(a.agentName) }}>
                      {getInitials(a.agentName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.agentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[a.role]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={STATUS_VARIANT[a.status]} className="text-[10px]">{a.status}</Badge>
                  {(a.status === "ready" || a.status === "in_progress") && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => onHandoff(a.id, false)}>
                        <X size={12} />
                        Reject
                      </Button>
                      <Button size="sm" className="gap-1" onClick={() => onHandoff(a.id, true)}>
                        <Check size={12} />
                        Pass
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onRemove(a.id)} title="Remove">
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

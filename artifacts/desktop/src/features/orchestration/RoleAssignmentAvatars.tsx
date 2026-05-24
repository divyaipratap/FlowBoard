import React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getAvatarColors, getInitials } from "@/lib/profile";

export type RoleAssignment = {
  id: string;
  agentName: string;
  role: "implementer" | "reviewer" | "tester" | "planner";
  status: "pending" | "ready" | "in_progress" | "done" | "rejected";
};

const ROLE_ORDER: RoleAssignment["role"][] = ["planner", "implementer", "reviewer", "tester"];

const ROLE_LABELS: Record<RoleAssignment["role"], string> = {
  planner: "Planner",
  implementer: "Implementer",
  reviewer: "Reviewer",
  tester: "Tester",
};

const STATUS_LABELS: Record<RoleAssignment["status"], string> = {
  pending: "Pending",
  ready: "Ready",
  in_progress: "In progress",
  done: "Done",
  rejected: "Rejected",
};

const STATUS_RING: Record<RoleAssignment["status"], string> = {
  pending: "ring-zinc-500/40",
  ready: "ring-blue-400",
  in_progress: "ring-yellow-400",
  done: "ring-emerald-400",
  rejected: "ring-red-400",
};

function colorForAgent(name: string): string {
  // Stable colour: pick from the avatar palette via a hash of the agent name.
  const palette = getAvatarColors();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export interface RoleAssignmentAvatarsProps {
  assignments: readonly RoleAssignment[];
  size?: "sm" | "md";
  max?: number;
}

/**
 * Stacked agent avatars with role tooltip on hover.
 * Agents are deduplicated so a single agent with multiple roles only renders once,
 * with the tooltip summarising every role they hold on this issue.
 */
export function RoleAssignmentAvatars({ assignments, size = "sm", max = 4 }: RoleAssignmentAvatarsProps) {
  if (assignments.length === 0) return null;

  // Group by agentName so we render a single avatar per person even if they
  // hold multiple roles on the issue.
  const byAgent = new Map<string, RoleAssignment[]>();
  for (const a of assignments) {
    const existing = byAgent.get(a.agentName) ?? [];
    existing.push(a);
    byAgent.set(a.agentName, existing);
  }

  const ordered = Array.from(byAgent.entries()).sort(([, a], [, b]) => {
    // Order by primary role using HANDOFF_ORDER index.
    const ra = Math.min(...a.map((x) => ROLE_ORDER.indexOf(x.role)));
    const rb = Math.min(...b.map((x) => ROLE_ORDER.indexOf(x.role)));
    return ra - rb;
  });

  const visible = ordered.slice(0, max);
  const overflow = ordered.length - visible.length;
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center -space-x-1.5">
        {visible.map(([agentName, roles]) => {
          // Active role is the first non-done one in handoff order.
          const sorted = [...roles].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
          const active = sorted.find((r) => r.status === "ready" || r.status === "in_progress") ?? sorted[0];
          const ringClass = STATUS_RING[active.status];
          return (
            <Tooltip key={agentName}>
              <TooltipTrigger asChild>
                <Avatar className={`${dim} border border-border ring-2 ${ringClass} ring-offset-1 ring-offset-background`}>
                  <AvatarFallback
                    className="font-semibold text-white"
                    style={{ backgroundColor: colorForAgent(agentName) }}
                  >
                    {getInitials(agentName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p className="font-medium">{agentName}</p>
                  {sorted.map((r) => (
                    <p key={r.id} className="text-xs text-muted-foreground">
                      {ROLE_LABELS[r.role]} — {STATUS_LABELS[r.status]}
                    </p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {overflow > 0 && (
          <div className={`${dim} rounded-full border border-border bg-white/10 flex items-center justify-center text-muted-foreground`}>
            +{overflow}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

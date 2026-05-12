import React from "react";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PulseRisk } from "./pulseTypes";

const severityIcon = {
  high: <ShieldAlert size={16} className="text-red-400" />,
  medium: <AlertTriangle size={16} className="text-yellow-400" />,
  low: <ShieldCheck size={16} className="text-emerald-400" />,
};

const severityClass = {
  high: "border-red-500/30 bg-red-500/10 text-red-200",
  medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-100",
  low: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100",
};

export const RiskRadar = ({ risks }: { risks: PulseRisk[] }) => {
  if (risks.length === 0) {
    return (
      <div className="glass-card rounded-lg p-4 text-sm text-muted-foreground">
        No major risks detected. This is a good time to plan, review, or create your next action.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {risks.map((risk, index) => (
        <article key={`${risk.type}-${index}`} className={`rounded-lg border p-4 ${severityClass[risk.severity]}`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {severityIcon[risk.severity]}
              <h3 className="text-sm font-semibold">{risk.title}</h3>
            </div>
            <Badge variant="outline" className="capitalize">{risk.severity}</Badge>
          </div>
          <p className="text-sm opacity-85">{risk.description}</p>
          <p className="mt-2 text-sm font-medium">Fix: {risk.suggestedFix}</p>
        </article>
      ))}
    </div>
  );
};

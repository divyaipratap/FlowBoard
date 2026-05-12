import React from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectNextAction } from "./pulseTypes";

export const NextBestActionCard = ({ action }: { action: ProjectNextAction }) => (
  <article className="glass-card rounded-lg p-4">
    <div className="mb-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{action.projectName}</p>
      <h3 className="mt-1 text-sm font-semibold text-white">{action.action}</h3>
    </div>
    <p className="text-sm leading-relaxed text-muted-foreground">{action.reason}</p>
    {action.issueId && (
      <Link href={`/projects/${action.projectId}/issues/${action.issueId}`}>
        <Button variant="ghost" size="sm" className="mt-3 gap-2 px-0 text-accent hover:bg-transparent hover:text-accent">
          {action.issueKey} {action.issueTitle}
          <ArrowUpRight size={14} />
        </Button>
      </Link>
    )}
  </article>
);

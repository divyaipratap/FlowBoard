import React from "react";
import { Link } from "wouter";
import { Issue } from "@workspace/api-client-react";
import { Clock3, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/profile";
import { getPriorityColor, getTypeIcon } from "./issue-visuals";

export const IssueCard = ({ issue, projectId }: { issue: Issue; projectId: string }) => {
  const issueWithDetails = issue as Issue & { description?: string };
  const labels = Array.isArray(issue.labels) ? issue.labels.slice(0, 2) : [];
  const updatedAt = issue.updatedAt ? new Date(issue.updatedAt) : null;
  const updatedLabel = updatedAt && !Number.isNaN(updatedAt.getTime())
    ? updatedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  return (
    <Link href={`/projects/${projectId}/issues/${issue.id}`}>
      <div
        className="glass-card group relative cursor-pointer overflow-hidden rounded-lg p-4 transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:bg-white/10 hover:shadow-[0_18px_44px_rgba(6,182,212,0.14)]"
      >
        <div className={`absolute inset-x-0 top-0 h-0.5 ${getPriorityColor(issue.priority).replace("text-", "bg-").split(" ")[0]}`} />
        <div className="flex justify-between items-start mb-2 gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              {getTypeIcon(issue.type, 14)}
              <span>{issue.issueKey}</span>
            </div>
            <p className="text-sm font-medium leading-snug line-clamp-2 text-foreground/90 group-hover:text-white transition-colors">
              {issue.title}
            </p>
          </div>
          <div className="shrink-0 mt-0.5">
            <Avatar className="h-6 w-6 border border-border">
              <AvatarFallback className="text-[10px] bg-white/10 text-muted-foreground">
                {issue.assignee ? getInitials(issue.assignee) : "?"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {issueWithDetails.description && (
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {issueWithDetails.description}
          </p>
        )}

        {labels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="max-w-[120px] truncate px-1.5 py-0 text-[10px]">
                {label}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            {issue.commentCount > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <MessageSquare size={12} />
                <span>{issue.commentCount}</span>
              </div>
            )}
            {updatedLabel && (
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock3 size={12} />
                <span>{updatedLabel}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border backdrop-blur ${getPriorityColor(issue.priority)}`}>
              {issue.priority}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
};

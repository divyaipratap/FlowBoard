import React from "react";
import { Link } from "wouter";
import { Issue } from "@workspace/api-client-react";
import { MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getPriorityColor, getTypeIcon } from "./issue-visuals";

export const IssueCard = ({ issue, projectId }: { issue: Issue; projectId: string }) => {
  return (
    <Link href={`/projects/${projectId}/issues/${issue.id}`}>
      <div
        className="bg-[#141414] border border-white/5 rounded-lg p-4 cursor-pointer hover:border-primary/40 hover:bg-[#1a1a1a] transition-all group shadow-sm hover:shadow-[0_0_15px_rgba(139,92,246,0.15)] relative overflow-hidden"
      >
        <div className="flex justify-between items-start mb-2 gap-2">
          <p className="text-sm font-medium leading-snug line-clamp-2 text-foreground/90 group-hover:text-white transition-colors">
            {issue.title}
          </p>
          <div className="shrink-0 mt-0.5">
            <Avatar className="h-6 w-6 border border-border">
              <AvatarFallback className="text-[10px] bg-secondary text-muted-foreground">
                {issue.assignee ? issue.assignee.substring(0, 2).toUpperCase() : "?"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            {getTypeIcon(issue.type)}
            <span className="text-xs font-mono text-muted-foreground">{issue.issueKey}</span>
          </div>

          <div className="flex items-center gap-2">
            {issue.commentCount > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <MessageSquare size={12} />
                <span>{issue.commentCount}</span>
              </div>
            )}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${getPriorityColor(issue.priority)}`}>
              {issue.priority}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
};

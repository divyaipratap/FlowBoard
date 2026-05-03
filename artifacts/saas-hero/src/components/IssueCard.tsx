import React from "react";
import { Link } from "wouter";
import { Issue, IssuePriority, IssueType } from "@workspace/api-client-react";
import { Bug, Zap, CheckSquare, BookOpen, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export const getTypeIcon = (type: IssueType, size = 16) => {
  switch (type) {
    case IssueType.bug:
      return <Bug size={size} className="text-red-400" />;
    case IssueType.feature:
      return <Zap size={size} className="text-violet-400" />;
    case IssueType.task:
      return <CheckSquare size={size} className="text-blue-400" />;
    case IssueType.story:
      return <BookOpen size={size} className="text-green-400" />;
    default:
      return <CheckSquare size={size} />;
  }
};

export const getPriorityColor = (priority: IssuePriority) => {
  switch (priority) {
    case IssuePriority.critical:
      return "text-red-500 bg-red-500/10 border-red-500/20";
    case IssuePriority.high:
      return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    case IssuePriority.medium:
      return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    case IssuePriority.low:
      return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    default:
      return "text-gray-400";
  }
};

export const IssueCard = ({ issue, projectId }: { issue: Issue; projectId: string }) => {
  return (
    <Link href={`/projects/${projectId}/issues/${issue.id}`}>
      <motion.div
        layoutId={issue.id}
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
      </motion.div>
    </Link>
  );
};

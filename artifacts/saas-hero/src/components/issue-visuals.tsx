import React from "react";
import { IssuePriority, IssueType } from "@workspace/api-client-react";
import { BookOpen, Bug, CheckSquare, Zap } from "lucide-react";

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

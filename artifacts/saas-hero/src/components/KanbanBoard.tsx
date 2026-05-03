import React, { useState } from "react";
import { useListIssues, useUpdateIssue, Issue, IssueStatus, getListIssuesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { IssueCard } from "./IssueCard";
import { CreateIssueDialog } from "./CreateIssueDialog";

const COLUMNS = [
  { id: IssueStatus.todo, title: "To Do", color: "#6b7280" }, // gray
  { id: IssueStatus.in_progress, title: "In Progress", color: "#3b82f6" }, // blue
  { id: IssueStatus.in_review, title: "In Review", color: "#eab308" }, // yellow
  { id: IssueStatus.done, title: "Done", color: "#22c55e" }, // green
];

export const KanbanBoard = ({ projectId }: { projectId: string }) => {
  const { data: issues } = useListIssues(projectId);
  const updateIssue = useUpdateIssue();
  const queryClient = useQueryClient();
  const [createColumnStatus, setCreateColumnStatus] = useState<IssueStatus | null>(null);

  const issuesByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = issues?.filter((i) => i.status === col.id) || [];
    return acc;
  }, {} as Record<string, Issue[]>);

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData("issueId", issueId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: IssueStatus) => {
    e.preventDefault();
    const issueId = e.dataTransfer.getData("issueId");
    if (!issueId) return;

    const issue = issues?.find((i) => i.id === issueId);
    if (issue && issue.status !== status) {
      // Optimistic update
      queryClient.setQueryData(getListIssuesQueryKey(projectId), (old: Issue[] | undefined) => {
        if (!old) return old;
        return old.map(i => i.id === issueId ? { ...i, status } : i);
      });

      updateIssue.mutate({
        issueId,
        data: { status }
      }, {
        onError: () => {
          queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(projectId) });
        }
      });
    }
  };

  return (
    <div className="flex h-full gap-6 h-full pb-4">
      {COLUMNS.map((col) => (
        <div
          key={col.id}
          className="flex flex-col w-[320px] shrink-0 h-full"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, col.id as IssueStatus)}
        >
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <h3 className="font-medium text-sm text-foreground/90">{col.title}</h3>
              <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                {issuesByStatus[col.id].length}
              </span>
            </div>
            <button
              onClick={() => setCreateColumnStatus(col.id as IssueStatus)}
              className="text-muted-foreground hover:text-white transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide pb-4">
            {issuesByStatus[col.id].map((issue) => (
              <div
                key={issue.id}
                draggable
                onDragStart={(e) => handleDragStart(e, issue.id)}
              >
                <IssueCard issue={issue} projectId={projectId} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <CreateIssueDialog
        projectId={projectId}
        open={!!createColumnStatus}
        onOpenChange={(open) => !open && setCreateColumnStatus(null)}
        defaultStatus={createColumnStatus || undefined}
      />
    </div>
  );
};

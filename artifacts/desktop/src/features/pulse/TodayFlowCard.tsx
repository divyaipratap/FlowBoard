import React from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, SkipForward } from "lucide-react";
import { useUpdateIssue, getListIssuesQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PulseTask } from "./pulseTypes";
import { pulseKeys } from "./pulseHooks";
import { StartFlowButton } from "./StartFlowButton";

export const TodayFlowCard = ({ task, onSkip }: { task: PulseTask; onSkip: (issueId: string) => void }) => {
  const queryClient = useQueryClient();
  const updateIssue = useUpdateIssue();

  const moveStatus = () => {
    updateIssue.mutate(
      { issueId: task.issueId, data: { status: "in_progress" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: pulseKeys.today });
          queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(task.projectId) });
          toast.success("Issue moved to in progress");
        },
        onError: () => toast.error("Could not move issue"),
      }
    );
  };

  return (
    <article className="glass-panel rounded-lg p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-accent/10 text-accent">#{task.order}</Badge>
            <Badge variant="secondary">{task.projectName}</Badge>
            <Badge variant="outline" className="capitalize">{task.priority}</Badge>
            <Badge variant="outline" className="capitalize">{task.status.replace("_", " ")}</Badge>
          </div>
          <h3 className="line-clamp-2 text-base font-semibold text-white">{task.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{task.reason}</p>
        </div>
        <div className="rounded-md bg-white/10 px-2 py-1 text-xs text-muted-foreground">
          {task.estimateBlocks} block{task.estimateBlocks === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{task.issueKey}</span>
        {task.dueDate && (
          <>
            <ArrowRight size={12} />
            <span>Due {task.dueDate}</span>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <StartFlowButton issueId={task.issueId} />
        <Link href={`/projects/${task.projectId}/issues/${task.issueId}`}>
          <Button variant="outline" className="gap-2">
            <Eye size={15} />
            Open issue
          </Button>
        </Link>
        {task.status !== "in_progress" && (
          <Button variant="outline" onClick={moveStatus} disabled={updateIssue.isPending}>
            Move status
          </Button>
        )}
        <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => onSkip(task.issueId)}>
          <SkipForward size={15} />
          Skip today
        </Button>
      </div>
    </article>
  );
};

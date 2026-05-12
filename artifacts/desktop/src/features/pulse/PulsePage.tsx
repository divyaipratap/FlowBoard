import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import { Activity, ArrowRight, CheckCircle2, Loader2, RefreshCw, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { toast } from "sonner";
import { usePulseToday, useRecomputePulse } from "./pulseHooks";
import { TodayFlowCard } from "./TodayFlowCard";
import { NextBestActionCard } from "./NextBestActionCard";
import { RiskRadar } from "./RiskRadar";
import { DailyReviewDialog } from "./DailyReviewDialog";

export const PulsePage = () => {
  const { data, isLoading, isError, refetch } = usePulseToday();
  const recomputePulse = useRecomputePulse();
  const [skippedIssueIds, setSkippedIssueIds] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const visibleTasks = useMemo(
    () => (data?.topTasks || []).filter((task) => !skippedIssueIds.includes(task.issueId)),
    [data?.topTasks, skippedIssueIds]
  );

  const recompute = () => {
    recomputePulse.mutate(undefined, {
      onSuccess: () => {
        refetch();
        toast.success("Pulse recomputed");
      },
      onError: () => toast.error("Could not recompute Pulse"),
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="glass-panel max-w-md rounded-lg p-6 text-center">
          <h1 className="text-lg font-semibold">Pulse is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">The local Pulse API did not respond. Check the desktop server and try again.</p>
          <Button className="mt-4" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  const hasNoWork = data.topTasks.length === 0 && data.projectNextActions.length === 0;
  const hasProjectsWithoutIssues = data.topTasks.length === 0 && data.projectNextActions.length > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="glass-panel border-x-0 border-t-0 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent accent-glow">
              <Activity size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Pulse</h1>
                <Badge variant="outline">{data.date}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Today's Flow, next best actions, and risk radar.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={recompute} disabled={recomputePulse.isPending}>
              <RefreshCw size={16} />
              Recompute
            </Button>
            <Button className="gap-2" onClick={() => setReviewOpen(true)}>
              <CheckCircle2 size={16} />
              Close the Loop
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Today's Flow</h2>
            <Badge variant="outline">{visibleTasks.length}</Badge>
          </div>

          {hasNoWork ? (
            <div className="glass-panel rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white">Create your first project and FlowBoard Pulse will help you decide what to work on next.</h3>
              <CreateProjectDialog>
                <Button className="mt-4 gap-2">
                  Create Project
                  <ArrowRight size={16} />
                </Button>
              </CreateProjectDialog>
            </div>
          ) : hasProjectsWithoutIssues ? (
            <div className="glass-panel rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white">Add a few issues and Pulse will turn them into a daily plan.</h3>
              <Link href="/today">
                <Button className="mt-4 gap-2">
                  Quick Capture
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="glass-panel rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white">Nothing urgent needs your attention.</h3>
              <p className="mt-2 text-sm text-muted-foreground">This is a good time to plan, review, or create your next action.</p>
              <Link href="/today">
                <Button className="mt-4 gap-2">
                  Create Next Action
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {visibleTasks.map((task) => (
                <TodayFlowCard
                  key={task.issueId}
                  task={task}
                  onSkip={(issueId) => setSkippedIssueIds((ids) => [...ids, issueId])}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-accent" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Next Best Action</h2>
            </div>
            <div className="grid gap-3">
              {data.projectNextActions.map((action) => (
                <NextBestActionCard key={action.projectId} action={action} />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-accent" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Risk Radar</h2>
            </div>
            <RiskRadar risks={data.risks} />
          </section>
        </aside>
      </div>

      <DailyReviewDialog
        date={data.date}
        tasks={data.topTasks}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
      />
    </div>
  );
};

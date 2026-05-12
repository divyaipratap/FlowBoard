import React, { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetProject,
  useGetProjectSummary,
  useListIssues,
  useListProjectStatuses,
  getListIssuesQueryKey,
  getListProjectStatusesQueryKey,
} from "@workspace/api-client-react";
import { KanbanBoard } from "../components/KanbanBoard";
import { IssueDetailDrawer } from "../components/IssueDetailDrawer";
import { ProjectCockpit } from "../components/ProjectCockpit";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, LayoutDashboard, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_STATUSES, getDoneStatus } from "@/lib/statuses";

export const ProjectView = () => {
  const { projectId, "*": pathParams } = useParams();
  const [, setLocation] = useLocation();
  const issueId = pathParams?.startsWith("issues/") ? pathParams.split("/")[1] : null;

  const { data: project, isLoading: isLoadingProject } = useGetProject(projectId || "");
  const { data: summary } = useGetProjectSummary(projectId || "");
  const activeProjectId = projectId || "";
  const { data: issues, isSuccess: hasIssueData } = useListIssues(activeProjectId, undefined, {
    query: {
      queryKey: getListIssuesQueryKey(activeProjectId),
      enabled: !!projectId,
      refetchInterval: 1000,
      refetchIntervalInBackground: true,
      staleTime: 0,
    },
  });
  const { data: statuses = DEFAULT_STATUSES } = useListProjectStatuses(activeProjectId, {
    query: { queryKey: getListProjectStatusesQueryKey(activeProjectId), enabled: !!projectId },
  });
  const issueList = issues || [];
  const doneStatus = getDoneStatus(statuses);
  const [view, setView] = useState<"board" | "cockpit">("board");
  const totalIssues = hasIssueData ? issueList.length : summary?.totalIssues || 0;
  const doneCount = hasIssueData
    ? issueList.filter((issue) => issue.status === doneStatus).length
    : summary?.byStatus?.[doneStatus] || 0;
  const activeCount = totalIssues - doneCount;
  const urgentCount = hasIssueData
    ? issueList.filter((issue) => issue.priority === "critical" || issue.priority === "high").length
    : (summary?.byPriority?.critical || 0) + (summary?.byPriority?.high || 0);
  const progress = totalIssues ? Math.round((doneCount / totalIssues) * 100) : 0;

  if (isLoadingProject) {
    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary w-8 h-8" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="glass-panel shrink-0 border-x-0 border-t-0 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-[260px] items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: project.color || "#8b5cf6" }}
            >
              {project.key.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
                <Badge variant="outline" className="text-[10px]">{project.key}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{totalIssues} issues - {progress}% complete</p>
            </div>
          </div>

          <div className="hidden min-w-[360px] flex-1 items-center gap-3 lg:flex">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10 shadow-inner">
              <div className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-emerald-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={<Clock3 size={14} />} label="Active" value={activeCount} />
              <Stat icon={<CheckCircle2 size={14} />} label="Done" value={doneCount} />
              <Stat icon={<AlertTriangle size={14} />} label="Urgent" value={urgentCount} />
            </div>
          </div>

          <div className="glass-card flex items-center rounded-lg p-1">
            <Button variant={view === "board" ? "secondary" : "ghost"} size="sm" onClick={() => setView("board")} className="gap-2">
              <LayoutDashboard size={16} />
              Board
            </Button>
            <Button variant={view === "cockpit" ? "secondary" : "ghost"} size="sm" onClick={() => setView("cockpit")} className="gap-2">
              <Sparkles size={16} />
              Cockpit
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden p-6 relative">
        {view === "board" ? (
          <div className="h-full overflow-x-auto overflow-y-hidden">
            <KanbanBoard projectId={project.id} />
          </div>
        ) : (
            <ProjectCockpit project={project} issues={issueList} />
        )}
      </div>

      <IssueDetailDrawer
        issueId={issueId}
        projectId={project.id}
        open={!!issueId}
        onOpenChange={(open) => {
          if (!open) setLocation(`/projects/${project.id}`);
        }}
      />
    </div>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="glass-card flex min-w-[78px] items-center gap-2 rounded-md px-2 py-1.5">
    <span className="text-accent">{icon}</span>
    <div>
      <p className="text-sm font-semibold leading-none">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  </div>
);

import React, { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetProject,
  useGetProjectSummary,
} from "@workspace/api-client-react";
import { KanbanBoard } from "../components/KanbanBoard";
import { IssueDetailDrawer } from "../components/IssueDetailDrawer";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const ProjectView = () => {
  const { projectId, "*": pathParams } = useParams();
  const [, setLocation] = useLocation();
  const issueId = pathParams?.startsWith("issues/") ? pathParams.split("/")[1] : null;

  const { data: project, isLoading: isLoadingProject } = useGetProject(projectId || "");
  const { data: summary } = useGetProjectSummary(projectId || "");
  
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
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-[#141414]/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-sm shadow-sm"
            style={{ backgroundColor: project.color || "#8b5cf6" }}
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
            <p className="text-xs text-muted-foreground">{project.key} - {summary?.totalIssues || 0} issues</p>
          </div>
        </div>
      </header>

      {/* Board Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 relative">
        <KanbanBoard projectId={project.id} />
      </div>

      {/* Issue Detail Drawer */}
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

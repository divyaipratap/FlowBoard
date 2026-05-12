import React, { useState } from "react";
import { useListIssues, useListProjectStatuses, useUpdateIssue, useUpdateProjectStatuses, Issue, ProjectStatus, getGetProjectSummaryQueryKey, getGetPulseTodayQueryKey, getListIssuesQueryKey, getListProjectStatusesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Circle, ListFilter, Plus, Search, Settings2, Trash2, UserRound, X } from "lucide-react";
import { IssueCard } from "./IssueCard";
import { CreateIssueDialog } from "./CreateIssueDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IssuePriority, IssueType } from "@workspace/api-client-react";
import { getCurrentUserName } from "@/lib/profile";
import { DEFAULT_STATUSES, LocalStatus, getStatusLabel } from "@/lib/statuses";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const KanbanBoard = ({ projectId }: { projectId: string }) => {
  const storageKey = `flowboard.boardFilters.${projectId}`;
  const [filters, setFilters] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || "{}") as {
        search?: string;
        priority?: string;
        type?: string;
        assignee?: string;
      };
    } catch {
      return {};
    }
  });
  const queryParams = {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.priority && filters.priority !== "all" ? { priority: filters.priority } : {}),
    ...(filters.type && filters.type !== "all" ? { type: filters.type } : {}),
    ...(filters.assignee ? { assignee: filters.assignee } : {}),
  };
  const { data: issues } = useListIssues(projectId, queryParams, {
    query: {
      queryKey: getListIssuesQueryKey(projectId, queryParams),
      refetchInterval: 1000,
      refetchIntervalInBackground: true,
      staleTime: 0,
    },
  });
  const { data: projectStatuses = DEFAULT_STATUSES } = useListProjectStatuses(projectId, {
    query: { queryKey: getListProjectStatusesQueryKey(projectId), enabled: !!projectId },
  });
  const columns = projectStatuses.map((status) => ({ id: status.name, title: getStatusLabel(status.name), color: status.color }));
  const updateIssue = useUpdateIssue();
  const queryClient = useQueryClient();
  const [createColumnStatus, setCreateColumnStatus] = useState<string | null>(null);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  const hasFilters = !!(filters.search || filters.assignee || (filters.priority && filters.priority !== "all") || (filters.type && filters.type !== "all"));
  const [controlsOpen, setControlsOpen] = useState(hasFilters);
  const [statusEditorOpen, setStatusEditorOpen] = useState(false);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const clearFilters = () => {
    setFilters({});
    window.localStorage.removeItem(storageKey);
  };

  const showMyTasks = () => updateFilter("assignee", getCurrentUserName());

  const issuesByStatus = columns.reduce((acc, col) => {
    acc[col.id] = issues?.filter((i) => i.status === col.id) || [];
    return acc;
  }, {} as Record<string, Issue[]>);

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData("issueId", issueId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingIssueId(issueId);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverStatus(status);
  };

  const patchIssueStatusInCache = (issueId: string, status: string) => {
    queryClient.setQueriesData(
      {
        predicate: (query) => {
          const [first] = query.queryKey;
          return typeof first === "string" && first === `/api/projects/${projectId}/issues`;
        },
      },
      (old: Issue[] | undefined) => {
        if (!old) return old;
        return old.map((i) => (i.id === issueId ? { ...i, status } : i));
      }
    );
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setOverStatus(null);
    setDraggingIssueId(null);
    const issueId = e.dataTransfer.getData("issueId");
    if (!issueId) return;
    const issue = issues?.find((i) => i.id === issueId);
    if (issue && issue.status !== status) {
      const previousStatus = issue.status;
      patchIssueStatusInCache(issueId, status);
      updateIssue.mutate({ issueId, data: { status } }, {
        onError: () => patchIssueStatusInCache(issueId, previousStatus),
        onSettled: () => {
          queryClient.invalidateQueries({
            predicate: (query) => {
              const [first] = query.queryKey;
              return typeof first === "string" && first === `/api/projects/${projectId}/issues`;
            },
          });
          queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
        },
      });
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="glass-panel shrink-0 rounded-lg p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 pr-1 text-sm font-medium">
            <ListFilter size={16} className="text-accent" />
            Board
            {hasFilters && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">Filtered</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setControlsOpen((open) => !open)} className="gap-2">
              <ChevronDown size={16} className={`transition-transform ${controlsOpen ? "rotate-180" : ""}`} />
              Filters
            </Button>
            <Button variant="outline" onClick={() => setStatusEditorOpen(true)} className="gap-2">
              <Settings2 size={16} />
              Statuses
            </Button>
            <Button onClick={() => setCreateColumnStatus(columns[0]?.id || "todo")} className="gap-2">
              <Plus size={16} />
              New issue
            </Button>
          </div>
        </div>
        {controlsOpen && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
            <div className="relative min-w-[260px] flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search || ""}
                onChange={(e) => updateFilter("search", e.target.value)}
                placeholder="Search issues"
                className="pl-9 bg-background"
              />
            </div>
            <Select value={filters.priority || "all"} onValueChange={(value) => updateFilter("priority", value)}>
              <SelectTrigger className="w-[150px] bg-background"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                {Object.values(IssuePriority).map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.type || "all"} onValueChange={(value) => updateFilter("type", value)}>
              <SelectTrigger className="w-[140px] bg-background"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All type</SelectItem>
                {Object.values(IssueType).map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={filters.assignee || ""}
              onChange={(e) => updateFilter("assignee", e.target.value)}
              placeholder="Assignee"
              className="w-[170px] bg-background"
            />
            <Button variant="outline" onClick={showMyTasks} className="gap-2">
              <UserRound size={16} />
              Mine
            </Button>
            <Button variant="outline" onClick={clearFilters} disabled={!hasFilters} className="gap-2">
              <X size={16} />
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-6 pb-4 min-h-0">
        {columns.map((col) => (
          <div
            key={col.id}
            className={`glass-panel flex flex-col w-[330px] shrink-0 h-full rounded-lg p-3 transition-colors ${
              overStatus === col.id ? "border-accent bg-accent/10" : ""
            }`}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDrop={(e) => handleDrop(e, col.id)}
            onDragLeave={() => setOverStatus((current) => current === col.id ? null : current)}
          >
            <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-md bg-background/80 px-1 py-1.5 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Circle size={10} fill={col.color} color={col.color} />
                <h3 className="font-medium text-sm text-foreground/90">{col.title}</h3>
                <span className="text-xs text-muted-foreground bg-white/10 px-2 py-0.5 rounded-full">
                  {issuesByStatus[col.id].length}
                </span>
              </div>
              <button
                onClick={() => setCreateColumnStatus(col.id)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                aria-label={`Create issue in ${col.title}`}
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 px-1 pb-2 pt-1">
              {issuesByStatus[col.id].map((issue) => (
                <div
                  key={issue.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, issue.id)}
                  onDragEnd={() => {
                    setDraggingIssueId(null);
                    setOverStatus(null);
                  }}
                  className={`transition-opacity ${draggingIssueId === issue.id ? "opacity-40" : "opacity-100"}`}
                >
                  <IssueCard issue={issue} projectId={projectId} />
                </div>
              ))}
              {issuesByStatus[col.id].length === 0 && (
                <div className="grid min-h-[140px] place-items-center rounded-lg border border-dashed border-white/15 bg-background/35 p-4 text-center text-sm text-muted-foreground">
                  <div>
                    <p>{hasFilters ? "No matching issues." : "Drop issues here or create one."}</p>
                    {!hasFilters && (
                      <Button variant="ghost" size="sm" onClick={() => setCreateColumnStatus(col.id)} className="mt-2 gap-2">
                        <Plus size={14} />
                        Add issue
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <CreateIssueDialog
        projectId={projectId}
        open={!!createColumnStatus}
        onOpenChange={(open) => !open && setCreateColumnStatus(null)}
        defaultStatus={createColumnStatus || undefined}
        statuses={columns}
      />
      <StatusEditorDialog
        projectId={projectId}
        open={statusEditorOpen}
        onOpenChange={setStatusEditorOpen}
        statuses={projectStatuses}
      />
    </div>
  );
};

const StatusEditorDialog = ({
  projectId,
  open,
  onOpenChange,
  statuses,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: Array<ProjectStatus | LocalStatus>;
}) => {
  const queryClient = useQueryClient();
  const updateStatuses = useUpdateProjectStatuses();
  const [draft, setDraft] = useState<LocalStatus[]>([]);

  React.useEffect(() => {
    if (open) {
      setDraft(statuses.map((status, index) => ({
        id: "id" in status ? status.id : undefined,
        name: status.name,
        color: status.color,
        position: index,
      })));
    }
  }, [open, statuses]);

  const save = () => {
    const normalized = draft
      .map((status, index) => ({ ...status, name: status.name.trim(), position: index }))
      .filter((status) => status.name.length > 0);
    if (normalized.length === 0) {
      toast.error("Keep at least one status");
      return;
    }
    const unique = new Set(normalized.map((status) => status.name.toLowerCase()));
    if (unique.size !== normalized.length) {
      toast.error("Status names must be unique");
      return;
    }
    updateStatuses.mutate(
      { projectId, data: { statuses: normalized } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectStatusesQueryKey(projectId) });
          queryClient.invalidateQueries({
            predicate: (query) => {
              const [first] = query.queryKey;
              return typeof first === "string" && first === `/api/projects/${projectId}/issues`;
            },
          });
          queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
          toast.success("Statuses updated");
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to update statuses"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Customize statuses</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Rename columns or add states like blocked. The last status is treated as completed.</p>
          <div className="space-y-2">
            {draft.map((status, index) => (
              <div key={`${status.id || "new"}-${index}`} className="grid grid-cols-[1fr_110px_auto] gap-2">
                <Input
                  value={status.name}
                  onChange={(event) => setDraft((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                />
                <Input
                  type="color"
                  value={status.color}
                  onChange={(event) => setDraft((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))}
                  className="h-10 p-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={draft.length <= 1}
                  onClick={() => setDraft((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setDraft((items) => [...items, { name: "blocked", color: "#ef4444", position: items.length }])}
          >
            <Plus size={15} />
            Add status
          </Button>
          <Label className="block text-xs text-muted-foreground">Tip: drag-and-drop cards into any custom status column.</Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={updateStatuses.isPending}>Save statuses</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

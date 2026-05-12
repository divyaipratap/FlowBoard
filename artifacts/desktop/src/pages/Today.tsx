import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useCreateIssue, useListIssues, useListProjects, getGetPulseTodayQueryKey, getListIssuesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Inbox, ListChecks, Play, Plus, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IssueCard } from "@/components/IssueCard";
import { getFocusQueue, getQuickWins, getStaleIssues, saveFocusQueue } from "@/lib/productivity";
import { getCurrentUserName } from "@/lib/profile";
import { Issue, IssuePriority, IssueType } from "@workspace/api-client-react";
import { toast } from "sonner";

const INBOX_KEY = "INBOX";

export const Today = () => {
  const { data: projects = [] } = useListProjects();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const primaryProjectId = selectedProjectId || projects[0]?.id || "";
  const { data: issues = [] } = useListIssues(primaryProjectId, undefined, {
    query: { queryKey: getListIssuesQueryKey(primaryProjectId), enabled: !!primaryProjectId },
  });
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const queryClient = useQueryClient();
  const createIssue = useCreateIssue();

  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    const refresh = () => setFocusIds(getFocusQueue().map((item) => item.issueId));
    refresh();
    window.addEventListener("flowboard:storage", refresh as EventListener);
    return () => window.removeEventListener("flowboard:storage", refresh as EventListener);
  }, []);

  const focusIssues = useMemo(() => issues.filter((issue) => focusIds.includes(issue.id)), [focusIds, issues]);
  const staleIssues = useMemo(() => getStaleIssues(issues), [issues]);
  const quickWins = useMemo(() => getQuickWins(issues), [issues]);
  const highPriority = issues.filter((issue) => issue.status !== "done" && ["high", "critical"].includes(issue.priority));

  const handleQuickCapture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryProjectId || !quickTitle.trim()) return;

    createIssue.mutate(
      {
        projectId: primaryProjectId,
        data: {
          title: quickTitle.trim(),
          description: quickNote.trim() || undefined,
          status: "todo",
          priority: IssuePriority.medium,
          type: IssueType.task,
          assignee: getCurrentUserName(),
          labels: [INBOX_KEY],
          reporter: getCurrentUserName(),
        },
      },
      {
        onSuccess: () => {
          setQuickTitle("");
          setQuickNote("");
          queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(primaryProjectId) });
          queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
          toast.success("Captured to inbox");
        },
        onError: () => toast.error("Failed to capture item"),
      }
    );
  };

  const removeFocus = (issueId: string) => {
    saveFocusQueue(getFocusQueue().filter((item) => item.issueId !== issueId));
    setFocusIds((ids) => ids.filter((id) => id !== issueId));
  };

  const Section = ({ title, icon, children, count }: { title: string; icon: React.ReactNode; children: React.ReactNode; count: number }) => (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <Badge variant="outline" className="text-xs">{count}</Badge>
      </div>
      {children}
    </section>
  );

  const IssueList = ({ list }: { list: Issue[] }) => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.slice(0, 6).map((issue) => (
        <IssueCard key={issue.id} issue={issue} projectId={issue.projectId} />
      ))}
      {list.length === 0 && (
        <div className="glass-card rounded-lg border-dashed p-4 text-sm text-muted-foreground">
          Nothing here right now.
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="glass-panel border-x-0 border-t-0 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-accent/15 text-accent flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Today</h1>
              <p className="text-xs text-muted-foreground">Focus queue, quick capture, and stale work radar</p>
            </div>
          </div>
          <Select value={primaryProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-[240px] bg-[#0a0a0a]">
              <SelectValue placeholder="Choose project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="p-6 space-y-8">
        <form onSubmit={handleQuickCapture} className="glass-panel rounded-lg p-4 grid gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Inbox size={16} className="text-accent" />
            Quick Capture Inbox
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder="Capture a task, idea, or reminder" className="bg-[#0a0a0a]" />
            <Button type="submit" disabled={!primaryProjectId || !quickTitle.trim() || createIssue.isPending} className="gap-2">
              <Plus size={16} />
              Capture
            </Button>
          </div>
          <Textarea value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="Optional note" className="bg-[#0a0a0a] min-h-[70px]" />
        </form>

        <Section title="Focus Queue" icon={<Target size={16} className="text-primary" />} count={focusIssues.length}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {focusIssues.map((issue) => (
              <div key={issue.id} className="space-y-2">
                <IssueCard issue={issue} projectId={issue.projectId} />
                <div className="flex gap-2">
                  <Link href={`/projects/${issue.projectId}/issues/${issue.id}`}>
                    <Button size="sm" className="gap-2 flex-1"><Play size={14} /> Start focus</Button>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => removeFocus(issue.id)}>Remove</Button>
                </div>
              </div>
            ))}
            {focusIssues.length === 0 && (
              <div className="glass-card rounded-lg border-dashed p-4 text-sm text-muted-foreground">
                Add issues to focus from an issue detail drawer.
              </div>
            )}
          </div>
        </Section>

        <Section title="High Priority" icon={<ListChecks size={16} className="text-orange-400" />} count={highPriority.length}>
          <IssueList list={highPriority} />
        </Section>

        <Section title="Stale Work Radar" icon={<AlertTriangle size={16} className="text-yellow-400" />} count={staleIssues.length}>
          <IssueList list={staleIssues} />
        </Section>

        <Section title="Quick Wins" icon={<Sparkles size={16} className="text-green-400" />} count={quickWins.length}>
          <IssueList list={quickWins} />
        </Section>
      </div>
    </div>
  );
};

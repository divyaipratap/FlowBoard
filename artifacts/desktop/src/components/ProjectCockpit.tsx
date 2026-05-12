import React, { useMemo, useState } from "react";
import { useCreateIssue, getGetPulseTodayQueryKey, getListIssuesQueryKey, Issue, IssuePriority, IssueType, Project } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Download, FileJson, FileText, Lightbulb, PackagePlus, Plus, RefreshCw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { addDecision, buildMarkdownExport, getDecisions, getStaleIssues, PROJECT_TEMPLATES } from "@/lib/productivity";
import { getCurrentUserName } from "@/lib/profile";
import { toast } from "sonner";

type Suggestion = {
  title: string;
  description?: string;
  type?: IssueType;
  priority?: IssuePriority;
  status?: string;
  rationale?: string;
  acceptanceCriteria?: string[];
  labels?: string[];
  effort?: string;
};

const PROMPT_PRESETS = [
  {
    label: "Build feature plan",
    prompt: "Break this feature request into implementation tickets with priorities, acceptance criteria, and a safe execution order:",
  },
  {
    label: "Improve productivity",
    prompt: "Analyze this project and create task tickets that make the product more useful, efficient, and polished for solo users.",
  },
  {
    label: "Find blockers",
    prompt: "Find blockers, stale work, missing validation, and risky gaps. Create prioritized tickets to resolve them.",
  },
  {
    label: "Launch checklist",
    prompt: "Create a launch-ready checklist as task tickets, including testing, polish, documentation, and risk reduction.",
  },
];

export const ProjectCockpit = ({ project, issues }: { project: Project; issues: Issue[] }) => {
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionContext, setDecisionContext] = useState("");
  const [decisionText, setDecisionText] = useState("");
  const [templateId, setTemplateId] = useState(PROJECT_TEMPLATES[0].id);
  const [aiPrompt, setAiPrompt] = useState("Break this goal into concrete task tickets with priorities and acceptance criteria.");
  const [taskCount, setTaskCount] = useState("6");
  const [aiModel, setAiModel] = useState(window.localStorage.getItem("flowboard.ai.model") || "");
  const [aiStatus, setAiStatus] = useState<string>("Not checked");
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [aiStrategy, setAiStrategy] = useState("");
  const [aiBlockers, setAiBlockers] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<number, boolean>>({});
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const createIssue = useCreateIssue();
  const queryClient = useQueryClient();

  const staleIssues = useMemo(() => getStaleIssues(issues), [issues]);
  const completedThisWeek = useMemo(() => {
    const start = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return issues.filter((issue) => issue.status === "done" && new Date(issue.updatedAt).getTime() >= start);
  }, [issues]);
  const decisions = useMemo(() => getDecisions(project.id), [project.id, refreshKey]);

  const createIssueFromSuggestion = (suggestion: Suggestion) => {
    const acceptance = suggestion.acceptanceCriteria?.length
      ? `\n\nAcceptance criteria:\n${suggestion.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`
      : "";
    const rationale = suggestion.rationale ? `\n\nAI rationale: ${suggestion.rationale}` : "";

    return createIssue.mutateAsync({
      projectId: project.id,
      data: {
        title: suggestion.title,
        description: `${suggestion.description || ""}${acceptance}${rationale}`.trim() || undefined,
        type: suggestion.type || IssueType.task,
        priority: suggestion.priority || IssuePriority.medium,
        status: suggestion.status || "todo",
        labels: suggestion.labels?.length ? suggestion.labels : ["ai-generated"],
        assignee: getCurrentUserName(),
        reporter: getCurrentUserName(),
      },
    });
  };

  const applySelectedSuggestions = async () => {
    const selected = aiSuggestions.filter((_, index) => selectedSuggestions[index]);
    if (selected.length === 0) return;
    await Promise.all(selected.map(createIssueFromSuggestion));
    queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(project.id) });
    queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
    toast.success(`Created ${selected.length} suggested issue${selected.length === 1 ? "" : "s"}`);
  };

  const applyTemplate = async () => {
    const template = PROJECT_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    await Promise.all(template.issues.map((issue) =>
      createIssue.mutateAsync({
        projectId: project.id,
        data: {
          ...issue,
          status: "todo",
          description: `Created from the ${template.name} template.`,
          assignee: getCurrentUserName(),
          reporter: getCurrentUserName(),
        },
      })
    ));
    queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(project.id) });
    queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
    toast.success(`${template.name} template added`);
  };

  const saveDecision = () => {
    if (!decisionTitle.trim() || !decisionText.trim()) return;
    addDecision({ projectId: project.id, title: decisionTitle.trim(), context: decisionContext.trim(), decision: decisionText.trim() });
    setDecisionTitle("");
    setDecisionContext("");
    setDecisionText("");
    setRefreshKey((value) => value + 1);
    toast.success("Decision saved");
  };

  const exportProject = (format: "json" | "markdown") => {
    const content = format === "json"
      ? JSON.stringify({ project, issues, decisions, exportedAt: new Date().toISOString() }, null, 2)
      : buildMarkdownExport(project, issues, decisions);
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.key.toLowerCase()}-flowboard-export.${format === "json" ? "json" : "md"}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const checkAi = async () => {
    setAiStatus("Checking...");
    const response = await fetch("/api/ai/status");
    const data = await response.json();
    const models = (data.models || []).map((model: { name: string; model?: string }) => model.model || model.name);
    setAiModels(models);
    setAiStatus(data.status === "ready" ? "Ready" : data.status === "no_models" ? "No models installed" : "Unavailable");
    if (!aiModel && models[0]) {
      setAiModel(models[0]);
      window.localStorage.setItem("flowboard.ai.model", models[0]);
    }
  };

  const runAiCoach = async () => {
    if (!aiModel) {
      toast.error("Choose an Ollama model first");
      return;
    }
    setIsAiBusy(true);
    try {
      const response = await fetch("/api/ai/project-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: aiModel,
          prompt: aiPrompt,
          taskCount: Number(taskCount),
          project,
          issues: issues.map(({ id, issueKey, title, status, priority, type, assignee, updatedAt }) => ({
            id,
            issueKey,
            title,
            status,
            priority,
            type,
            assignee,
            updatedAt,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI request failed");
      const suggestions = Array.isArray(data.nextSteps) ? data.nextSteps : [];
      setAiSummary(data.summary || "");
      setAiStrategy(data.strategy || "");
      setAiBlockers(Array.isArray(data.blockers) ? data.blockers : []);
      setAiSuggestions(suggestions);
      setSelectedSuggestions(Object.fromEntries(suggestions.map((_: unknown, index: number) => [index, true])));
    } catch {
      toast.error("AI coach failed. Check Ollama and selected model.");
    } finally {
      setIsAiBusy(false);
    }
  };

  return (
    <Tabs defaultValue="coach" className="h-full flex flex-col">
      <TabsList className="glass-card w-fit">
        <TabsTrigger value="coach" className="gap-2"><Bot size={14} /> AI Coach</TabsTrigger>
        <TabsTrigger value="review" className="gap-2"><CheckCircle2 size={14} /> Weekly Review</TabsTrigger>
        <TabsTrigger value="templates" className="gap-2"><PackagePlus size={14} /> Templates</TabsTrigger>
        <TabsTrigger value="decisions" className="gap-2"><Lightbulb size={14} /> Decisions</TabsTrigger>
        <TabsTrigger value="export" className="gap-2"><Download size={14} /> Export</TabsTrigger>
      </TabsList>

      <TabsContent value="coach" className="flex-1 overflow-y-auto space-y-4">
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[220px]">
              <p className="text-xs uppercase text-muted-foreground mb-2">Ollama model</p>
              <Select value={aiModel} onValueChange={(value) => { setAiModel(value); window.localStorage.setItem("flowboard.ai.model", value); }}>
                <SelectTrigger className="bg-[#0a0a0a]"><SelectValue placeholder="Check Ollama models" /></SelectTrigger>
                <SelectContent>
                  {aiModels.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px]">
              <p className="text-xs uppercase text-muted-foreground mb-2">Tickets</p>
              <Select value={taskCount} onValueChange={setTaskCount}>
                <SelectTrigger className="bg-[#0a0a0a]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["3", "5", "6", "8", "10", "12"].map((count) => <SelectItem key={count} value={count}>{count} tickets</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={checkAi} className="gap-2"><RefreshCw size={16} /> {aiStatus}</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PROMPT_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAiPrompt(`${preset.prompt}\n\n`)}
                className="gap-2"
              >
                <Sparkles size={14} />
                {preset.label}
              </Button>
            ))}
          </div>
          <Textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} className="bg-[#0a0a0a] min-h-[90px]" />
          <Button onClick={runAiCoach} disabled={isAiBusy} className="gap-2">
            <Bot size={16} />
            {isAiBusy ? "Generating tickets..." : "Generate task tickets"}
          </Button>
        </div>

        {(aiSummary || aiSuggestions.length > 0) && (
          <div className="glass-panel rounded-lg p-4 space-y-4">
            <p className="text-sm text-foreground/90">{aiSummary}</p>
            {aiStrategy && <p className="text-sm text-primary">Strategy: {aiStrategy}</p>}
            {aiBlockers.length > 0 && <p className="text-sm text-yellow-300">Blockers: {aiBlockers.join(", ")}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedSuggestions(Object.fromEntries(aiSuggestions.map((_, index) => [index, true])))}
              >
                Select all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedSuggestions({})}>
                Select none
              </Button>
            </div>
            <div className="space-y-3">
              {aiSuggestions.map((suggestion, index) => (
                <label key={`${suggestion.title}-${index}`} className="flex gap-3 rounded-md border border-border bg-[#0a0a0a] p-3">
                  <Checkbox checked={!!selectedSuggestions[index]} onCheckedChange={(checked) => setSelectedSuggestions((old) => ({ ...old, [index]: checked === true }))} />
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{suggestion.title}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">{suggestion.priority || "medium"}</Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">{suggestion.type || "task"}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{(suggestion.status || "todo").replace("_", " ")}</Badge>
                      {suggestion.effort && <Badge variant="outline" className="text-[10px] capitalize">{suggestion.effort} effort</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{suggestion.description || suggestion.rationale}</p>
                    {suggestion.acceptanceCriteria && suggestion.acceptanceCriteria.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Done when: </span>
                        {suggestion.acceptanceCriteria.join("; ")}
                      </div>
                    )}
                    {suggestion.rationale && <p className="text-xs text-primary/80">Why: {suggestion.rationale}</p>}
                  </div>
                </label>
              ))}
            </div>
            <Button onClick={applySelectedSuggestions} disabled={createIssue.isPending}>Create selected issues</Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="review" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="glass-card rounded-lg p-4"><p className="text-2xl font-bold">{issues.length}</p><p className="text-sm text-muted-foreground">Total issues</p></div>
          <div className="glass-card rounded-lg p-4"><p className="text-2xl font-bold">{completedThisWeek.length}</p><p className="text-sm text-muted-foreground">Completed this week</p></div>
          <div className="glass-card rounded-lg p-4"><p className="text-2xl font-bold">{staleIssues.length}</p><p className="text-sm text-muted-foreground">Stale active issues</p></div>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <h3 className="font-semibold mb-3">Stale work</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            {staleIssues.slice(0, 8).map((issue) => <p key={issue.id}>{issue.issueKey} - {issue.title}</p>)}
            {staleIssues.length === 0 && <p>No stale work right now.</p>}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="templates" className="space-y-4">
        <div className="glass-panel rounded-lg p-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px]">
            <p className="text-xs uppercase text-muted-foreground mb-2">Template</p>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="bg-[#0a0a0a]"><SelectValue /></SelectTrigger>
              <SelectContent>{PROJECT_TEMPLATES.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={applyTemplate} className="gap-2"><Plus size={16} /> Add template issues</Button>
        </div>
      </TabsContent>

      <TabsContent value="decisions" className="space-y-4">
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <Input value={decisionTitle} onChange={(e) => setDecisionTitle(e.target.value)} placeholder="Decision title" className="bg-[#0a0a0a]" />
          <Input value={decisionContext} onChange={(e) => setDecisionContext(e.target.value)} placeholder="Context" className="bg-[#0a0a0a]" />
          <Textarea value={decisionText} onChange={(e) => setDecisionText(e.target.value)} placeholder="What did you decide?" className="bg-[#0a0a0a]" />
          <Button onClick={saveDecision} disabled={!decisionTitle.trim() || !decisionText.trim()} className="gap-2"><Save size={16} /> Save decision</Button>
        </div>
        <div className="space-y-3">
          {decisions.map((decision) => (
            <div key={decision.id} className="glass-card rounded-lg p-4">
              <p className="font-medium">{decision.title}</p>
              <p className="text-xs text-muted-foreground">{new Date(decision.createdAt).toLocaleString()} {decision.context ? `- ${decision.context}` : ""}</p>
              <p className="text-sm mt-2">{decision.decision}</p>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="export" className="space-y-4">
        <div className="glass-panel rounded-lg p-4 flex gap-3">
          <Button onClick={() => exportProject("markdown")} className="gap-2"><FileText size={16} /> Export Markdown</Button>
          <Button onClick={() => exportProject("json")} variant="outline" className="gap-2"><FileJson size={16} /> Export JSON</Button>
        </div>
      </TabsContent>
    </Tabs>
  );
};

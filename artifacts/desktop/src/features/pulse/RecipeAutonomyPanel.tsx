import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  Play,
  Plus,
  Power,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type RecipeSelector = {
  statuses?: string[];
  priorities?: string[];
  types?: string[];
  labels?: string[];
  projectId?: string | null;
  maxIssues?: number;
  skipIfPendingProposalExists?: boolean;
};

type RecipeRules = {
  mustOpenProposal?: boolean;
  mustProduceWorkProof?: boolean;
  dryRun?: boolean;
};

type RecipeProposalSpec = {
  kind: "issue_note" | "status_update";
  template?: string;
  targetStatus?: string;
};

type PulseRecipe = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  agentName: string;
  selector: RecipeSelector;
  scheduleExpr: string;
  rules: RecipeRules;
  proposal: RecipeProposalSpec;
  lastRunAt: string | number | null;
  nextRunAt: string | number | null;
  createdAt: string | number;
  updatedAt: string | number;
};

type PulseRecipeRun = {
  id: string;
  recipeId: string;
  triggeredBy: "scheduled" | "manual";
  startedAt: string | number;
  finishedAt: string | number | null;
  status: "running" | "completed" | "errored";
  matchedCount: number;
  proposalIds: string[];
  skipped: Array<{ issueId: string; issueKey?: string; reason: string }>;
  errors: string[];
  notes: string | null;
};

type GlobalState = {
  globalPaused: boolean;
  updatedAt: string | number;
};

function timeAgo(ts: string | number | null | undefined): string {
  if (!ts) return "never";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return "";
  }
}

function describeSchedule(expr: string): string {
  const e = (expr || "").trim().toLowerCase();
  if (e === "nightly") return "Every night at 03:00";
  if (e === "hourly") return "Every hour";
  const daily = e.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  if (daily) return `Every day at ${daily[1].padStart(2, "0")}:${daily[2]}`;
  const weekday = e.match(/^weekday\s+(\d{1,2}):(\d{2})$/);
  if (weekday) return `Mon–Fri at ${weekday[1].padStart(2, "0")}:${weekday[2]}`;
  const every = e.match(/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours)$/);
  if (every) {
    const n = Number(every[1]);
    const unit = every[2];
    const isHour = unit.startsWith("h") && !unit.startsWith("min");
    return `Every ${n}${isHour ? "h" : "m"}`;
  }
  return expr || "nightly";
}

type RecipeFormState = {
  name: string;
  description: string;
  enabled: boolean;
  agentName: string;
  scheduleExpr: string;
  statuses: string;
  priorities: string;
  types: string;
  labels: string;
  maxIssues: number;
  skipIfPendingProposalExists: boolean;
  proposalKind: "issue_note" | "status_update";
  template: string;
  targetStatus: string;
  mustProduceWorkProof: boolean;
  dryRun: boolean;
};

function recipeToForm(r: PulseRecipe | null): RecipeFormState {
  return {
    name: r?.name ?? "",
    description: r?.description ?? "",
    enabled: r?.enabled ?? true,
    agentName: r?.agentName ?? "Pulse",
    scheduleExpr: r?.scheduleExpr ?? "nightly",
    statuses: (r?.selector.statuses ?? ["todo"]).join(", "),
    priorities: (r?.selector.priorities ?? ["critical", "high"]).join(", "),
    types: (r?.selector.types ?? ["task"]).join(", "),
    labels: (r?.selector.labels ?? []).join(", "),
    maxIssues: r?.selector.maxIssues ?? 3,
    skipIfPendingProposalExists: r?.selector.skipIfPendingProposalExists ?? true,
    proposalKind: r?.proposal.kind ?? "issue_note",
    template: r?.proposal.template ?? "Pulse picked {issueKey} for review.\n\nReason: {reason}\nRecipe: {recipeName} ({date})",
    targetStatus: r?.proposal.targetStatus ?? "in_progress",
    mustProduceWorkProof: r?.rules.mustProduceWorkProof ?? false,
    dryRun: r?.rules.dryRun ?? false,
  };
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formToPayload(form: RecipeFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    enabled: form.enabled,
    agentName: form.agentName.trim() || "Pulse",
    scheduleExpr: form.scheduleExpr.trim() || "nightly",
    selector: {
      statuses: parseCsv(form.statuses),
      priorities: parseCsv(form.priorities),
      types: parseCsv(form.types),
      labels: parseCsv(form.labels),
      maxIssues: Math.max(1, Math.min(20, Number(form.maxIssues) || 3)),
      skipIfPendingProposalExists: form.skipIfPendingProposalExists,
    },
    rules: {
      mustOpenProposal: true,
      mustProduceWorkProof: form.mustProduceWorkProof,
      dryRun: form.dryRun,
    },
    proposal: {
      kind: form.proposalKind,
      template: form.template,
      targetStatus: form.targetStatus,
    },
  };
}

export const RecipeAutonomyPanel = () => {
  const [recipes, setRecipes] = useState<PulseRecipe[]>([]);
  const [runs, setRuns] = useState<PulseRecipeRun[]>([]);
  const [global, setGlobal] = useState<GlobalState>({ globalPaused: false, updatedAt: 0 });
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RecipeFormState>(recipeToForm(null));
  const [busy, setBusy] = useState<string | null>(null);
  const [showRuns, setShowRuns] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [recipesRes, runsRes] = await Promise.all([
        fetch("/api/pulse/recipes"),
        fetch("/api/pulse/runs?limit=30"),
      ]);
      if (recipesRes.ok) {
        const body = await recipesRes.json();
        setRecipes(body.recipes || []);
        if (body.global) setGlobal(body.global);
      }
      if (runsRes.ok) {
        const body = await runsRes.json();
        setRuns(body.runs || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => { void refresh(); };
    window.addEventListener("flowboard:agent-bridge-changed", onChange);
    const interval = window.setInterval(() => { void refresh(); }, 30_000);
    return () => {
      window.removeEventListener("flowboard:agent-bridge-changed", onChange);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const openNew = () => {
    setEditingId(null);
    setForm(recipeToForm(null));
    setEditorOpen(true);
  };

  const openEdit = (r: PulseRecipe) => {
    setEditingId(r.id);
    setForm(recipeToForm(r));
    setEditorOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy("save");
    try {
      const payload = formToPayload(form);
      const url = editingId ? `/api/pulse/recipes/${editingId}` : "/api/pulse/recipes";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(editingId ? "Recipe updated" : "Recipe created");
      setEditorOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const toggleEnabled = async (recipe: PulseRecipe) => {
    setBusy(recipe.id);
    try {
      const res = await fetch(`/api/pulse/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !recipe.enabled }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Toggle failed");
    } finally {
      setBusy(null);
    }
  };

  const runNow = async (recipe: PulseRecipe) => {
    setBusy(recipe.id);
    try {
      const res = await fetch(`/api/pulse/recipes/${recipe.id}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Run failed");
      const body = await res.json();
      const proposals = (body.run?.proposalIds || []).length;
      const skipped = (body.run?.skipped || []).length;
      toast.success(
        proposals > 0
          ? `Created ${proposals} proposal${proposals === 1 ? "" : "s"}`
          : skipped > 0
            ? "Nothing new to propose"
            : "No matching issues",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Run failed");
    } finally {
      setBusy(null);
    }
  };

  const removeRecipe = async (recipe: PulseRecipe) => {
    if (!window.confirm(`Delete recipe "${recipe.name}"? Run history is preserved.`)) return;
    setBusy(recipe.id);
    try {
      const res = await fetch(`/api/pulse/recipes/${recipe.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Recipe deleted");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const toggleGlobalPause = async () => {
    setBusy("global");
    try {
      const res = await fetch("/api/pulse/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !global.globalPaused }),
      });
      if (!res.ok) throw new Error("Pause toggle failed");
      const body = await res.json();
      if (body.global) setGlobal(body.global);
      toast.success(body.global?.globalPaused ? "Pulse autonomy paused" : "Pulse autonomy resumed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Toggle failed");
    } finally {
      setBusy(null);
    }
  };

  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const visibleRuns = runs.slice(0, 10);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Workflow size={16} className="text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pulse Autonomy
          </h2>
          <Badge variant="outline">{recipes.length}</Badge>
          {global.globalPaused && (
            <Badge className="border-amber-400/40 bg-amber-400/10 text-amber-200">Paused</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={global.globalPaused ? "default" : "outline"}
            size="sm"
            className="gap-2"
            disabled={busy === "global"}
            onClick={toggleGlobalPause}
            title="Kill switch — pauses all recipes immediately"
          >
            <Power size={14} />
            {global.globalPaused ? "Resume all" : "Pause all"}
          </Button>
          <Button size="sm" className="gap-2" onClick={openNew}>
            <Plus size={14} />
            New recipe
          </Button>
        </div>
      </div>

      <div className="glass-panel rounded-lg border border-white/5 p-1">
        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">Loading recipes…</div>
        ) : recipes.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-white">No autonomous recipes yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create one to schedule agent runs against your board. Proposals go to the Agent Inbox — never direct status changes.
            </p>
            <Button className="mt-3 gap-2" size="sm" onClick={openNew}>
              <Plus size={14} />
              Create first recipe
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {recipes.map((recipe) => (
              <li key={recipe.id} className="flex items-start gap-3 px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/5 bg-accent/10 text-accent">
                  <Zap size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{recipe.name}</p>
                    {!recipe.enabled && (
                      <Badge className="border-muted/40 bg-muted/20 text-muted-foreground">Paused</Badge>
                    )}
                    {recipe.rules.dryRun && (
                      <Badge className="border-amber-400/40 bg-amber-400/10 text-amber-200">Dry run</Badge>
                    )}
                  </div>
                  {recipe.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{recipe.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {describeSchedule(recipe.scheduleExpr)}
                    </span>
                    <span>Last: {timeAgo(recipe.lastRunAt)}</span>
                    <span>Next: {timeAgo(recipe.nextRunAt)}</span>
                    <span>
                      {recipe.proposal.kind === "issue_note" ? "Proposes notes" : `Proposes status → ${recipe.proposal.targetStatus}`}
                    </span>
                    <span>Cap {recipe.selector.maxIssues}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={recipe.enabled}
                    disabled={busy === recipe.id || global.globalPaused}
                    onCheckedChange={() => void toggleEnabled(recipe)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[11px]"
                    disabled={busy === recipe.id || global.globalPaused}
                    onClick={() => void runNow(recipe)}
                    title="Run now"
                  >
                    <Play size={12} />
                    Run
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => openEdit(recipe)}
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-300"
                    disabled={busy === recipe.id}
                    onClick={() => void removeRecipe(recipe)}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-2 text-xs text-muted-foreground hover:text-white"
          onClick={() => setShowRuns((v) => !v)}
        >
          <Activity size={14} />
          {showRuns ? "Hide" : "Show"} run history ({runs.length})
        </Button>
        {showRuns && (
          <div className="mt-2 glass-panel rounded-lg border border-white/5">
            {visibleRuns.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">No runs yet</div>
            ) : (
              <ul className="divide-y divide-white/5">
                {visibleRuns.map((run) => {
                  const recipe = recipesById.get(run.recipeId);
                  const ok = run.status === "completed" && run.errors.length === 0;
                  const errored = run.status === "errored" || run.errors.length > 0;
                  return (
                    <li key={run.id} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        {errored ? (
                          <AlertTriangle size={13} className="text-red-300" />
                        ) : ok ? (
                          <CheckCircle2 size={13} className="text-emerald-300" />
                        ) : (
                          <Clock size={13} className="text-muted-foreground" />
                        )}
                        <span className="font-medium text-white">{recipe?.name ?? "Deleted recipe"}</span>
                        <Badge variant="outline" className="text-[10px]">{run.triggeredBy}</Badge>
                        <span className="ml-auto text-muted-foreground">{timeAgo(run.startedAt)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>Matched {run.matchedCount}</span>
                        <span>Proposals {run.proposalIds.length}</span>
                        {run.skipped.length > 0 && <span>Skipped {run.skipped.length}</span>}
                        {run.errors.length > 0 && <span className="text-red-300">Errors {run.errors.length}</span>}
                        {run.notes && <span>· {run.notes}</span>}
                      </div>
                      {run.skipped.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-4 text-[11px] text-muted-foreground/80">
                          {run.skipped.slice(0, 3).map((s, i) => (
                            <li key={i}>· {s.issueKey ?? s.issueId}: {s.reason}</li>
                          ))}
                        </ul>
                      )}
                      {run.errors.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-4 text-[11px] text-red-300/90">
                          {run.errors.slice(0, 3).map((e, i) => (
                            <li key={i}>· {e}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit recipe" : "New recipe"}</DialogTitle>
            <DialogDescription>
              Pulse recipes schedule agents against your board. Matches drop into the Agent Inbox as proposals — they never auto-merge.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid gap-1">
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-xs">Schedule</Label>
                <Input
                  value={form.scheduleExpr}
                  onChange={(e) => setForm({ ...form, scheduleExpr: e.target.value })}
                  placeholder="nightly | hourly | daily 09:00 | weekday 09:00 | every 30m | every 4h"
                />
                <p className="text-[10px] text-muted-foreground">{describeSchedule(form.scheduleExpr)}</p>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Agent name (shown on proposals)</Label>
                <Input
                  value={form.agentName}
                  onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-md border border-white/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selector</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Statuses (csv)</Label>
                  <Input
                    value={form.statuses}
                    onChange={(e) => setForm({ ...form, statuses: e.target.value })}
                    placeholder="todo, in_progress"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Priorities (csv)</Label>
                  <Input
                    value={form.priorities}
                    onChange={(e) => setForm({ ...form, priorities: e.target.value })}
                    placeholder="critical, high"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Types (csv)</Label>
                  <Input
                    value={form.types}
                    onChange={(e) => setForm({ ...form, types: e.target.value })}
                    placeholder="task, bug, feature"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Labels (csv, any-match)</Label>
                  <Input
                    value={form.labels}
                    onChange={(e) => setForm({ ...form, labels: e.target.value })}
                    placeholder="agent, pulse-eligible"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Max issues per run</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={form.maxIssues}
                    onChange={(e) => setForm({ ...form, maxIssues: Number(e.target.value) || 3 })}
                  />
                </div>
                <div className="flex items-center justify-between rounded border border-white/5 px-2 py-1.5">
                  <Label className="text-xs">Skip if pending proposal exists</Label>
                  <Switch
                    checked={form.skipIfPendingProposalExists}
                    onCheckedChange={(v) => setForm({ ...form, skipIfPendingProposalExists: v })}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-md border border-white/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proposal</p>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Kind</Label>
                  <Select
                    value={form.proposalKind}
                    onValueChange={(v) => setForm({ ...form, proposalKind: v as RecipeProposalSpec["kind"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="issue_note">Progress note on the issue</SelectItem>
                      <SelectItem value="status_update">Status update</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.proposalKind === "issue_note" && (
                  <div className="grid gap-1">
                    <Label className="text-xs">Note template</Label>
                    <Textarea
                      rows={3}
                      value={form.template}
                      onChange={(e) => setForm({ ...form, template: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Placeholders: {"{issueKey} {title} {reason} {date} {recipeName}"}
                    </p>
                  </div>
                )}
                {form.proposalKind === "status_update" && (
                  <div className="grid gap-1">
                    <Label className="text-xs">Target status</Label>
                    <Input
                      value={form.targetStatus}
                      onChange={(e) => setForm({ ...form, targetStatus: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-white/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rules</p>
              <div className="grid gap-2">
                <div className="flex items-center justify-between rounded border border-white/5 px-2 py-1.5">
                  <div>
                    <Label className="text-xs">Dry run</Label>
                    <p className="text-[10px] text-muted-foreground">Log matches without creating proposals.</p>
                  </div>
                  <Switch checked={form.dryRun} onCheckedChange={(v) => setForm({ ...form, dryRun: v })} />
                </div>
                <div className="flex items-center justify-between rounded border border-white/5 px-2 py-1.5">
                  <div>
                    <Label className="text-xs">Require WorkProof on completion</Label>
                    <p className="text-[10px] text-muted-foreground">Informational; enforced by Agent Bridge rules.</p>
                  </div>
                  <Switch
                    checked={form.mustProduceWorkProof}
                    onCheckedChange={(v) => setForm({ ...form, mustProduceWorkProof: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded border border-white/5 px-2 py-1.5">
                  <div>
                    <Label className="text-xs">Enabled</Label>
                    <p className="text-[10px] text-muted-foreground">Paused recipes never run, even on schedule.</p>
                  </div>
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)} disabled={busy === "save"}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy === "save"}>
              {editingId ? "Save changes" : "Create recipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

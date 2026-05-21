import { randomUUID } from "crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  agentInboxProposalsTable,
  issuesTable,
  projectsTable,
  pulseGlobalTable,
  pulseRecipeRunsTable,
  pulseRecipesTable,
} from "../schema";
import { createAgentInboxProposal } from "../agentBridge";
import { emitFlowBoardEvent } from "../events";
import { computeNextRunAt, parseScheduleExpr } from "./schedule";

export type RecipeSelector = {
  statuses?: string[];
  priorities?: string[];
  types?: string[];
  labels?: string[];
  projectId?: string | null;
  maxIssues?: number;
  skipIfPendingProposalExists?: boolean;
};

export type RecipeRules = {
  mustOpenProposal?: boolean;
  mustProduceWorkProof?: boolean;
  dryRun?: boolean;
};

export type RecipeProposalSpec = {
  kind: "issue_note" | "status_update";
  template?: string;
  targetStatus?: string;
};

export type PulseRecipe = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  agentName: string;
  selector: RecipeSelector;
  scheduleExpr: string;
  rules: RecipeRules;
  proposal: RecipeProposalSpec;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PulseRecipeRun = {
  id: string;
  recipeId: string;
  triggeredBy: "scheduled" | "manual";
  startedAt: Date;
  finishedAt: Date | null;
  status: "running" | "completed" | "errored";
  matchedCount: number;
  proposalIds: string[];
  skipped: Array<{ issueId: string; issueKey?: string; reason: string }>;
  errors: string[];
  notes: string | null;
};

export type PulseGlobalState = {
  globalPaused: boolean;
  updatedAt: Date;
};

const DEFAULT_SELECTOR: Required<Pick<RecipeSelector, "statuses" | "priorities" | "types" | "labels" | "maxIssues" | "skipIfPendingProposalExists">> = {
  statuses: ["todo"],
  priorities: ["critical", "high"],
  types: ["task"],
  labels: [],
  maxIssues: 3,
  skipIfPendingProposalExists: true,
};

const DEFAULT_RULES: Required<RecipeRules> = {
  mustOpenProposal: true,
  mustProduceWorkProof: false,
  dryRun: false,
};

const DEFAULT_PROPOSAL: RecipeProposalSpec = {
  kind: "issue_note",
  template:
    "Pulse suggests this ticket as a focus for {date}. Reason: {reason}.\n\nRecipe: {recipeName}",
};

const GLOBAL_ID = "default";

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseJsonObject<T = Record<string, unknown>>(raw: string | null | undefined): T {
  if (!raw) return {} as T;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function parseJsonArray<T = unknown>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean) : [];
}

function normalizeSelector(raw: unknown): RecipeSelector {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    statuses: normalizeStrings(obj.statuses).length ? normalizeStrings(obj.statuses) : DEFAULT_SELECTOR.statuses,
    priorities: normalizeStrings(obj.priorities).length ? normalizeStrings(obj.priorities) : DEFAULT_SELECTOR.priorities,
    types: normalizeStrings(obj.types).length ? normalizeStrings(obj.types) : DEFAULT_SELECTOR.types,
    labels: normalizeStrings(obj.labels),
    projectId: typeof obj.projectId === "string" && obj.projectId.trim() ? obj.projectId.trim() : null,
    maxIssues: Math.min(Math.max(Number(obj.maxIssues ?? DEFAULT_SELECTOR.maxIssues), 1), 20),
    skipIfPendingProposalExists:
      typeof obj.skipIfPendingProposalExists === "boolean"
        ? obj.skipIfPendingProposalExists
        : DEFAULT_SELECTOR.skipIfPendingProposalExists,
  };
}

function normalizeRules(raw: unknown): RecipeRules {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    mustOpenProposal: typeof obj.mustOpenProposal === "boolean" ? obj.mustOpenProposal : DEFAULT_RULES.mustOpenProposal,
    mustProduceWorkProof:
      typeof obj.mustProduceWorkProof === "boolean" ? obj.mustProduceWorkProof : DEFAULT_RULES.mustProduceWorkProof,
    dryRun: typeof obj.dryRun === "boolean" ? obj.dryRun : DEFAULT_RULES.dryRun,
  };
}

function normalizeProposal(raw: unknown): RecipeProposalSpec {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = obj.kind === "status_update" ? "status_update" : "issue_note";
  return {
    kind,
    template: typeof obj.template === "string" ? obj.template : DEFAULT_PROPOSAL.template,
    targetStatus: typeof obj.targetStatus === "string" && obj.targetStatus.trim() ? obj.targetStatus.trim() : undefined,
  };
}

function normalizeRecipe(row: typeof pulseRecipesTable.$inferSelect): PulseRecipe {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    enabled: Boolean(row.enabled),
    agentName: row.agentName,
    selector: normalizeSelector(parseJsonObject(row.selector)),
    scheduleExpr: row.scheduleExpr,
    rules: normalizeRules(parseJsonObject(row.rules)),
    proposal: normalizeProposal(parseJsonObject(row.proposal)),
    lastRunAt: row.lastRunAt ?? null,
    nextRunAt: row.nextRunAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeRun(row: typeof pulseRecipeRunsTable.$inferSelect): PulseRecipeRun {
  return {
    id: row.id,
    recipeId: row.recipeId,
    triggeredBy: row.triggeredBy === "manual" ? "manual" : "scheduled",
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? null,
    status:
      row.status === "completed" || row.status === "errored"
        ? row.status
        : "running",
    matchedCount: row.matchedCount,
    proposalIds: parseJsonArray<string>(row.proposalIds),
    skipped: parseJsonArray<{ issueId: string; issueKey?: string; reason: string }>(row.skipped),
    errors: parseJsonArray<string>(row.errors),
    notes: row.notes ?? null,
  };
}

export async function getPulseGlobalState(): Promise<PulseGlobalState> {
  const db = getDb();
  const [existing] = await db.select().from(pulseGlobalTable).where(eq(pulseGlobalTable.id, GLOBAL_ID));
  if (existing) {
    return { globalPaused: Boolean(existing.globalPaused), updatedAt: existing.updatedAt };
  }
  const [created] = await db
    .insert(pulseGlobalTable)
    .values({ id: GLOBAL_ID, globalPaused: false })
    .returning();
  return { globalPaused: Boolean(created.globalPaused), updatedAt: created.updatedAt };
}

export async function setPulseGlobalPaused(paused: boolean): Promise<PulseGlobalState> {
  const db = getDb();
  await getPulseGlobalState();
  const [updated] = await db
    .update(pulseGlobalTable)
    .set({ globalPaused: paused, updatedAt: new Date() })
    .where(eq(pulseGlobalTable.id, GLOBAL_ID))
    .returning();
  return { globalPaused: Boolean(updated.globalPaused), updatedAt: updated.updatedAt };
}

export async function listPulseRecipes(): Promise<PulseRecipe[]> {
  const db = getDb();
  const rows = await db.select().from(pulseRecipesTable).orderBy(desc(pulseRecipesTable.updatedAt));
  return rows.map(normalizeRecipe);
}

export async function getPulseRecipe(id: string): Promise<PulseRecipe | null> {
  const db = getDb();
  const [row] = await db.select().from(pulseRecipesTable).where(eq(pulseRecipesTable.id, id));
  return row ? normalizeRecipe(row) : null;
}

export async function createPulseRecipe(input: {
  name: string;
  description?: string | null;
  enabled?: boolean;
  agentName?: string;
  selector?: unknown;
  scheduleExpr?: string;
  rules?: unknown;
  proposal?: unknown;
}): Promise<PulseRecipe> {
  const db = getDb();
  const now = new Date();
  const scheduleExpr = (input.scheduleExpr ?? "nightly").trim() || "nightly";
  const parsed = parseScheduleExpr(scheduleExpr);
  const [row] = await db
    .insert(pulseRecipesTable)
    .values({
      id: randomUUID(),
      name: input.name.trim() || "Untitled recipe",
      description: input.description ?? null,
      enabled: input.enabled ?? true,
      agentName: (input.agentName ?? "Pulse").trim() || "Pulse",
      selector: safeJson(normalizeSelector(input.selector)),
      scheduleExpr,
      rules: safeJson(normalizeRules(input.rules)),
      proposal: safeJson(normalizeProposal(input.proposal)),
      nextRunAt: computeNextRunAt(parsed, now, null),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  emitFlowBoardEvent({ type: "proposal.changed" });
  return normalizeRecipe(row);
}

export async function updatePulseRecipe(id: string, patch: Partial<PulseRecipe>): Promise<PulseRecipe> {
  const db = getDb();
  const existing = await getPulseRecipe(id);
  if (!existing) throw new Error("Recipe not found");
  const next = { ...existing, ...patch };
  const scheduleExpr = (patch.scheduleExpr ?? existing.scheduleExpr).trim() || "nightly";
  const parsed = parseScheduleExpr(scheduleExpr);
  const nextRunAt = computeNextRunAt(parsed, new Date(), existing.lastRunAt ?? null);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.name === "string") update.name = patch.name.trim() || existing.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (typeof patch.enabled === "boolean") update.enabled = patch.enabled;
  if (typeof patch.agentName === "string") update.agentName = patch.agentName.trim() || existing.agentName;
  if (patch.selector !== undefined) update.selector = safeJson(normalizeSelector(patch.selector));
  if (typeof patch.scheduleExpr === "string") {
    update.scheduleExpr = scheduleExpr;
    update.nextRunAt = nextRunAt;
  }
  if (patch.rules !== undefined) update.rules = safeJson(normalizeRules(patch.rules));
  if (patch.proposal !== undefined) update.proposal = safeJson(normalizeProposal(patch.proposal));

  const [row] = await db.update(pulseRecipesTable).set(update).where(eq(pulseRecipesTable.id, id)).returning();
  emitFlowBoardEvent({ type: "proposal.changed" });
  void next; // computed for default merging only
  return normalizeRecipe(row);
}

export async function deletePulseRecipe(id: string): Promise<void> {
  const db = getDb();
  await db.delete(pulseRecipesTable).where(eq(pulseRecipesTable.id, id));
  emitFlowBoardEvent({ type: "proposal.changed" });
}

export async function listPulseRecipeRuns(recipeId?: string, limit = 30): Promise<PulseRecipeRun[]> {
  const db = getDb();
  const clamped = Math.min(Math.max(limit, 1), 200);
  const rows = recipeId
    ? await db
        .select()
        .from(pulseRecipeRunsTable)
        .where(eq(pulseRecipeRunsTable.recipeId, recipeId))
        .orderBy(desc(pulseRecipeRunsTable.startedAt))
        .limit(clamped)
    : await db
        .select()
        .from(pulseRecipeRunsTable)
        .orderBy(desc(pulseRecipeRunsTable.startedAt))
        .limit(clamped);
  return rows.map(normalizeRun);
}

async function findCandidateIssues(selector: RecipeSelector) {
  const db = getDb();
  const filters = [ne(issuesTable.status, "done")];
  if (selector.statuses && selector.statuses.length > 0) {
    filters.push(inArray(issuesTable.status, selector.statuses));
  }
  if (selector.priorities && selector.priorities.length > 0) {
    filters.push(inArray(issuesTable.priority, selector.priorities));
  }
  if (selector.types && selector.types.length > 0) {
    filters.push(inArray(issuesTable.type, selector.types));
  }
  if (selector.projectId) {
    filters.push(eq(issuesTable.projectId, selector.projectId));
  }
  const issues = await db
    .select()
    .from(issuesTable)
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .orderBy(desc(issuesTable.updatedAt));

  const filtered = selector.labels && selector.labels.length > 0
    ? issues.filter((issue) => {
        try {
          const labels: string[] = JSON.parse(issue.labels);
          return Array.isArray(labels) && selector.labels!.some((l) => labels.includes(l));
        } catch {
          return false;
        }
      })
    : issues;

  const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  filtered.sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 9;
    const pb = priorityRank[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
  });

  return filtered.slice(0, selector.maxIssues ?? 3);
}

async function pendingProposalIssueIds(): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ issueId: agentInboxProposalsTable.issueId })
    .from(agentInboxProposalsTable)
    .where(eq(agentInboxProposalsTable.status, "pending"));
  const set = new Set<string>();
  for (const row of rows) {
    if (row.issueId) set.add(row.issueId);
  }
  return set;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function executeRecipe(recipeId: string, triggeredBy: "scheduled" | "manual" = "manual"): Promise<PulseRecipeRun> {
  const db = getDb();
  const recipe = await getPulseRecipe(recipeId);
  if (!recipe) throw new Error("Recipe not found");

  const startedAt = new Date();
  const [runRow] = await db
    .insert(pulseRecipeRunsTable)
    .values({
      id: randomUUID(),
      recipeId,
      triggeredBy,
      startedAt,
      status: "running",
    })
    .returning();

  const run = normalizeRun(runRow);
  const skipped: PulseRecipeRun["skipped"] = [];
  const errors: string[] = [];
  const proposalIds: string[] = [];

  try {
    const global = await getPulseGlobalState();
    if (global.globalPaused) {
      skipped.push({ issueId: "-", reason: "Pulse is globally paused" });
      return await finalizeRun(run.id, {
        status: "completed",
        matchedCount: 0,
        skipped,
        errors,
        proposalIds,
        notes: "Global pause is on; no proposals created.",
      });
    }

    if (!recipe.enabled) {
      skipped.push({ issueId: "-", reason: "Recipe is paused" });
      return await finalizeRun(run.id, {
        status: "completed",
        matchedCount: 0,
        skipped,
        errors,
        proposalIds,
        notes: "Recipe paused; no proposals created.",
      });
    }

    const candidates = await findCandidateIssues(recipe.selector);
    const projects = await db.select().from(projectsTable);
    const projectByKey = new Map(projects.map((p) => [p.id, p]));
    const pendingIssueIds = recipe.selector.skipIfPendingProposalExists
      ? await pendingProposalIssueIds()
      : new Set<string>();

    for (const issue of candidates) {
      const project = projectByKey.get(issue.projectId);
      const issueKey = `${project?.key ?? "PROJ"}-${issue.issueNumber}`;

      if (pendingIssueIds.has(issue.id)) {
        skipped.push({ issueId: issue.id, issueKey, reason: "Pending proposal already exists for this issue" });
        continue;
      }

      if (recipe.rules.dryRun) {
        skipped.push({ issueId: issue.id, issueKey, reason: "dryRun=true; would have created a proposal" });
        continue;
      }

      const vars = {
        issueKey,
        date: startedAt.toISOString().slice(0, 10),
        reason: `${issue.priority} priority ${issue.type} not yet started`,
        recipeName: recipe.name,
        title: issue.title,
      };

      try {
        if (recipe.proposal.kind === "issue_note") {
          const content = fillTemplate(recipe.proposal.template ?? DEFAULT_PROPOSAL.template!, vars);
          const proposal = await createAgentInboxProposal({
            agentName: recipe.agentName,
            toolName: "pulse_runner",
            proposalType: "issue_note",
            action: `Pulse recipe: ${recipe.name}`,
            issueId: issue.id,
            projectId: issue.projectId,
            title: `Pulse picked ${issueKey} for review`,
            description: content,
            payload: { content, recipeId: recipe.id, recipeName: recipe.name },
          });
          proposalIds.push(proposal.id);
        } else if (recipe.proposal.kind === "status_update") {
          const targetStatus = recipe.proposal.targetStatus || "in_progress";
          const proposal = await createAgentInboxProposal({
            agentName: recipe.agentName,
            toolName: "pulse_runner",
            proposalType: "status_update",
            action: `Pulse recipe: ${recipe.name}`,
            issueId: issue.id,
            projectId: issue.projectId,
            title: `Move ${issueKey} to ${targetStatus}`,
            description: `Pulse recipe "${recipe.name}" suggests starting this ${issue.priority}-priority ${issue.type}.`,
            payload: { status: targetStatus, recipeId: recipe.id, recipeName: recipe.name },
          });
          proposalIds.push(proposal.id);
        }
      } catch (error) {
        errors.push(`${issueKey}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const parsed = parseScheduleExpr(recipe.scheduleExpr);
    const finishedAt = new Date();
    const nextRunAt = computeNextRunAt(parsed, finishedAt, finishedAt);
    await db
      .update(pulseRecipesTable)
      .set({ lastRunAt: finishedAt, nextRunAt, updatedAt: finishedAt })
      .where(eq(pulseRecipesTable.id, recipeId));

    return await finalizeRun(run.id, {
      status: "completed",
      matchedCount: candidates.length,
      skipped,
      errors,
      proposalIds,
      notes: candidates.length === 0 ? "No matching issues" : null,
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return await finalizeRun(run.id, {
      status: "errored",
      matchedCount: 0,
      skipped,
      errors,
      proposalIds,
      notes: "Run errored",
    });
  }
}

async function finalizeRun(
  runId: string,
  input: {
    status: "completed" | "errored";
    matchedCount: number;
    skipped: PulseRecipeRun["skipped"];
    errors: string[];
    proposalIds: string[];
    notes: string | null;
  },
): Promise<PulseRecipeRun> {
  const db = getDb();
  const [row] = await db
    .update(pulseRecipeRunsTable)
    .set({
      status: input.status,
      finishedAt: new Date(),
      matchedCount: input.matchedCount,
      proposalIds: safeJson(input.proposalIds),
      skipped: safeJson(input.skipped),
      errors: safeJson(input.errors),
      notes: input.notes,
    })
    .where(eq(pulseRecipeRunsTable.id, runId))
    .returning();
  emitFlowBoardEvent({ type: "proposal.changed" });
  return normalizeRun(row);
}

let runnerHandle: NodeJS.Timeout | null = null;

export function startPulseRunner(options: { tickMs?: number } = {}): void {
  const tickMs = options.tickMs ?? 60_000;
  if (runnerHandle) return;
  const tick = async () => {
    try {
      const global = await getPulseGlobalState();
      if (global.globalPaused) return;
      const db = getDb();
      const now = new Date();
      const dueRecipes = await db
        .select()
        .from(pulseRecipesTable)
        .where(eq(pulseRecipesTable.enabled, true));
      for (const row of dueRecipes) {
        const next = row.nextRunAt;
        if (!next || next.getTime() <= now.getTime()) {
          try {
            await executeRecipe(row.id, "scheduled");
          } catch (error) {
            console.error(`[pulse] recipe ${row.id} failed:`, error);
          }
        }
      }
    } catch (error) {
      console.error("[pulse] tick failed:", error);
    }
  };
  runnerHandle = setInterval(tick, tickMs);
  // Run once immediately at startup (non-blocking)
  void tick();
}

export function stopPulseRunner(): void {
  if (runnerHandle) {
    clearInterval(runnerHandle);
    runnerHandle = null;
  }
}

export async function seedDefaultRecipeIfMissing(): Promise<void> {
  const db = getDb();
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(pulseRecipesTable);
  if ((count?.n ?? 0) > 0) return;
  await createPulseRecipe({
    name: "Nightly: top 3 high-priority tasks",
    description:
      "Picks up to 3 high-priority work items in todo each night and drops review proposals into the Agent Inbox. Approve to surface them in your morning queue.",
    enabled: true,
    agentName: "Pulse",
    selector: {
      statuses: ["todo"],
      priorities: ["critical", "high"],
      types: ["task", "feature", "bug"],
      maxIssues: 3,
      skipIfPendingProposalExists: true,
    },
    scheduleExpr: "nightly",
    rules: {
      mustOpenProposal: true,
      mustProduceWorkProof: false,
      dryRun: false,
    },
    proposal: {
      kind: "issue_note",
      template:
        "Pulse picked {issueKey} for tomorrow's focus.\n\nReason: {reason}.\nRecipe: {recipeName} ({date}).\n\nApprove this note to flag it on the issue; reject to skip.",
    },
  });
}

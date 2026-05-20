import { createHash, randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { agentWorkProofsTable } from "./schema";

export type WorkProofVerdict = "green" | "red" | "unverified";

export type WorkProofCheckStatus = "pass" | "fail" | "missing";

export type WorkProofChecks = {
  tests: WorkProofCheckStatus;
  lint: WorkProofCheckStatus;
  typecheck: WorkProofCheckStatus;
  build: WorkProofCheckStatus;
};

export type WorkProofCommandResult = {
  name: string;
  command: string;
  exitCode: number;
  durationMs: number | null;
  stdoutTail: string;
  stderrTail: string;
};

export type WorkProofEnvironment = Record<string, string>;

export type WorkProofInput = {
  agentModel: string | null;
  gitCommitSha: string | null;
  gitDiffHashBefore: string | null;
  gitDiffHashAfter: string | null;
  filesChanged: string[];
  commandResults: WorkProofCommandResult[];
  environment: WorkProofEnvironment;
  startedAt: Date | null;
  finishedAt: Date | null;
  runtimeMs: number | null;
};

export type WorkProofRecord = {
  id: string;
  worklogId: string;
  issueId: string;
  projectId: string;
  agentName: string;
  agentModel: string | null;
  gitCommitSha: string | null;
  gitDiffHashBefore: string | null;
  gitDiffHashAfter: string | null;
  filesChanged: string[];
  commandResults: WorkProofCommandResult[];
  checks: WorkProofChecks;
  environment: WorkProofEnvironment;
  verdict: WorkProofVerdict;
  startedAt: Date | null;
  finishedAt: Date | null;
  runtimeMs: number | null;
  chainIndex: number;
  prevHash: string | null;
  proofHash: string;
  createdAt: Date;
};

const TRUNCATE_TAIL = 4_000;
const RECOGNIZED_CHECK_NAMES = new Set<keyof WorkProofChecks>(["tests", "lint", "typecheck", "build"]);

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function asNonEmptyString(value: unknown): string | null {
  const result = asString(value);
  return result.length > 0 ? result : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).map((item) => item.trim()).filter(Boolean)
    : [];
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function asEnvironment(value: unknown): WorkProofEnvironment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: WorkProofEnvironment = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const k = asString(key);
    if (!k) continue;
    const v = asString(raw);
    if (v) out[k] = v.slice(0, 512);
  }
  return out;
}

function truncateTail(value: unknown): string {
  const raw = asString(value);
  if (!raw) return "";
  if (raw.length <= TRUNCATE_TAIL) return raw;
  return raw.slice(-TRUNCATE_TAIL);
}

function parseCommandResult(raw: unknown): WorkProofCommandResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const command = asString(obj.command);
  if (!command) return null;
  const exitCode = asInteger(obj.exitCode);
  if (exitCode === null) return null;
  const name = asString(obj.name) || command.split(/\s+/)[0] || "command";
  return {
    name: name.slice(0, 64),
    command: command.slice(0, 2_000),
    exitCode,
    durationMs: asInteger(obj.durationMs),
    stdoutTail: truncateTail(obj.stdoutTail),
    stderrTail: truncateTail(obj.stderrTail),
  };
}

export function parseWorkProofInput(raw: unknown): WorkProofInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const commandsRaw = Array.isArray(obj.commands) ? obj.commands : Array.isArray(obj.commandResults) ? obj.commandResults : [];
  const commandResults = commandsRaw
    .map(parseCommandResult)
    .filter((entry): entry is WorkProofCommandResult => entry !== null);

  const filesChanged = asStringArray(obj.filesChanged);
  const startedAt = asDate(obj.startedAt);
  const finishedAt = asDate(obj.finishedAt);
  const runtimeMsExplicit = asInteger(obj.runtimeMs);
  const runtimeMs =
    runtimeMsExplicit !== null
      ? runtimeMsExplicit
      : startedAt && finishedAt
        ? Math.max(0, finishedAt.getTime() - startedAt.getTime())
        : null;

  const hasAnySignal =
    commandResults.length > 0 ||
    filesChanged.length > 0 ||
    asNonEmptyString(obj.gitDiffHashAfter) !== null ||
    asNonEmptyString(obj.gitDiffHashBefore) !== null ||
    asNonEmptyString(obj.gitCommitSha) !== null;
  if (!hasAnySignal) return null;

  return {
    agentModel: asNonEmptyString(obj.agentModel),
    gitCommitSha: asNonEmptyString(obj.gitCommitSha),
    gitDiffHashBefore: asNonEmptyString(obj.gitDiffHashBefore),
    gitDiffHashAfter: asNonEmptyString(obj.gitDiffHashAfter),
    filesChanged,
    commandResults,
    environment: asEnvironment(obj.environment),
    startedAt,
    finishedAt,
    runtimeMs,
  };
}

export function deriveChecks(commandResults: WorkProofCommandResult[]): WorkProofChecks {
  const checks: WorkProofChecks = { tests: "missing", lint: "missing", typecheck: "missing", build: "missing" };
  for (const result of commandResults) {
    const key = result.name.toLowerCase() as keyof WorkProofChecks;
    if (!RECOGNIZED_CHECK_NAMES.has(key)) continue;
    if (checks[key] === "fail") continue;
    checks[key] = result.exitCode === 0 ? "pass" : "fail";
  }
  return checks;
}

export function deriveVerdict(commandResults: WorkProofCommandResult[]): WorkProofVerdict {
  if (commandResults.length === 0) return "unverified";
  return commandResults.every((result) => result.exitCode === 0) ? "green" : "red";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = canonicalize(v);
    return out;
  }
  return value;
}

export function computeProofHash(stableFields: Record<string, unknown>): string {
  const canonical = JSON.stringify(canonicalize(stableFields));
  return createHash("sha256").update(canonical).digest("hex");
}

type CreateWorkProofParams = {
  worklogId: string;
  issueId: string;
  projectId: string;
  agentName: string;
  input: WorkProofInput;
};

export async function createWorkProof(params: CreateWorkProofParams): Promise<WorkProofRecord> {
  const db = getDb();
  const { worklogId, issueId, projectId, agentName, input } = params;

  const [previous] = await db
    .select()
    .from(agentWorkProofsTable)
    .where(eq(agentWorkProofsTable.issueId, issueId))
    .orderBy(desc(agentWorkProofsTable.chainIndex))
    .limit(1);

  const chainIndex = previous ? previous.chainIndex + 1 : 0;
  const prevHash = previous?.proofHash ?? null;
  const checks = deriveChecks(input.commandResults);
  const verdict = deriveVerdict(input.commandResults);

  const stableFields = {
    agentModel: input.agentModel,
    agentName,
    chainIndex,
    checks,
    commandResults: input.commandResults,
    environment: input.environment,
    filesChanged: input.filesChanged,
    finishedAt: input.finishedAt ? input.finishedAt.toISOString() : null,
    gitCommitSha: input.gitCommitSha,
    gitDiffHashAfter: input.gitDiffHashAfter,
    gitDiffHashBefore: input.gitDiffHashBefore,
    issueId,
    prevHash,
    projectId,
    runtimeMs: input.runtimeMs,
    startedAt: input.startedAt ? input.startedAt.toISOString() : null,
    verdict,
    worklogId,
  };

  const proofHash = computeProofHash(stableFields);

  const [row] = await db
    .insert(agentWorkProofsTable)
    .values({
      id: randomUUID(),
      worklogId,
      issueId,
      projectId,
      agentName,
      agentModel: input.agentModel,
      gitCommitSha: input.gitCommitSha,
      gitDiffHashBefore: input.gitDiffHashBefore,
      gitDiffHashAfter: input.gitDiffHashAfter,
      filesChanged: JSON.stringify(input.filesChanged),
      commandResults: JSON.stringify(input.commandResults),
      checks: JSON.stringify(checks),
      environment: JSON.stringify(input.environment),
      verdict,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      runtimeMs: input.runtimeMs,
      chainIndex,
      prevHash,
      proofHash,
    })
    .returning();

  return rowToRecord(row);
}

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToRecord(row: typeof agentWorkProofsTable.$inferSelect): WorkProofRecord {
  return {
    id: row.id,
    worklogId: row.worklogId,
    issueId: row.issueId,
    projectId: row.projectId,
    agentName: row.agentName,
    agentModel: row.agentModel,
    gitCommitSha: row.gitCommitSha,
    gitDiffHashBefore: row.gitDiffHashBefore,
    gitDiffHashAfter: row.gitDiffHashAfter,
    filesChanged: safeParse<string[]>(row.filesChanged, []),
    commandResults: safeParse<WorkProofCommandResult[]>(row.commandResults, []),
    checks: { ...deriveChecks([]), ...safeParse<Partial<WorkProofChecks>>(row.checks, {}) },
    environment: safeParse<WorkProofEnvironment>(row.environment, {}),
    verdict: (row.verdict as WorkProofVerdict) ?? "unverified",
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    runtimeMs: row.runtimeMs,
    chainIndex: row.chainIndex,
    prevHash: row.prevHash,
    proofHash: row.proofHash,
    createdAt: row.createdAt,
  };
}

export async function getWorkProofByWorklog(worklogId: string): Promise<WorkProofRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentWorkProofsTable)
    .where(eq(agentWorkProofsTable.worklogId, worklogId));
  return row ? rowToRecord(row) : null;
}

export async function listWorkProofsByWorklogIds(worklogIds: string[]): Promise<Map<string, WorkProofRecord>> {
  const map = new Map<string, WorkProofRecord>();
  if (worklogIds.length === 0) return map;
  const db = getDb();
  for (const worklogId of worklogIds) {
    const [row] = await db
      .select()
      .from(agentWorkProofsTable)
      .where(eq(agentWorkProofsTable.worklogId, worklogId));
    if (row) map.set(worklogId, rowToRecord(row));
  }
  return map;
}

export type ListWorkProofsResult = {
  proofs: WorkProofRecord[];
  chainValid: boolean;
  brokenAtChainIndex: number | null;
};

export async function listWorkProofsForIssue(issueId: string): Promise<ListWorkProofsResult> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentWorkProofsTable)
    .where(eq(agentWorkProofsTable.issueId, issueId))
    .orderBy(agentWorkProofsTable.chainIndex);
  const proofs = rows.map(rowToRecord);
  const verification = verifyChain(proofs);
  return { proofs, chainValid: verification.chainValid, brokenAtChainIndex: verification.brokenAtChainIndex };
}

export async function latestGreenWorkProofForIssue(issueId: string): Promise<WorkProofRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentWorkProofsTable)
    .where(and(eq(agentWorkProofsTable.issueId, issueId), eq(agentWorkProofsTable.verdict, "green")))
    .orderBy(desc(agentWorkProofsTable.chainIndex))
    .limit(1);
  return row ? rowToRecord(row) : null;
}

export function verifyChain(proofs: WorkProofRecord[]): { chainValid: boolean; brokenAtChainIndex: number | null } {
  let expectedPrev: string | null = null;
  for (const proof of proofs) {
    if (proof.prevHash !== expectedPrev) {
      return { chainValid: false, brokenAtChainIndex: proof.chainIndex };
    }
    const stableFields = {
      agentModel: proof.agentModel,
      agentName: proof.agentName,
      chainIndex: proof.chainIndex,
      checks: proof.checks,
      commandResults: proof.commandResults,
      environment: proof.environment,
      filesChanged: proof.filesChanged,
      finishedAt: proof.finishedAt ? proof.finishedAt.toISOString() : null,
      gitCommitSha: proof.gitCommitSha,
      gitDiffHashAfter: proof.gitDiffHashAfter,
      gitDiffHashBefore: proof.gitDiffHashBefore,
      issueId: proof.issueId,
      prevHash: proof.prevHash,
      projectId: proof.projectId,
      runtimeMs: proof.runtimeMs,
      startedAt: proof.startedAt ? proof.startedAt.toISOString() : null,
      verdict: proof.verdict,
      worklogId: proof.worklogId,
    };
    if (computeProofHash(stableFields) !== proof.proofHash) {
      return { chainValid: false, brokenAtChainIndex: proof.chainIndex };
    }
    expectedPrev = proof.proofHash;
  }
  return { chainValid: true, brokenAtChainIndex: null };
}

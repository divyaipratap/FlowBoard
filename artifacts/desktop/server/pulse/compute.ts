import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { issueSignalsTable, issuesTable, projectStatusesTable, projectsTable } from "../schema";

type ProjectRow = typeof projectsTable.$inferSelect;
type IssueRow = typeof issuesTable.$inferSelect;

type PulseScore = {
  issue: IssueRow;
  project: ProjectRow;
  score: number;
  reason: string;
};

type PulseRiskSeverity = "low" | "medium" | "high";

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 50,
  high: 35,
  medium: 20,
  low: 5,
};

const STATUS_WEIGHT: Record<string, number> = {
  todo: 10,
  in_progress: 25,
  in_review: 18,
  done: -100,
};

function parseLabels(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function issueKey(project: ProjectRow, issue: IssueRow) {
  return `${project.key}-${issue.issueNumber}`;
}

function isDoneStatus(issue: IssueRow, doneStatusByProject: Map<string, string>) {
  return issue.status === (doneStatusByProject.get(issue.projectId) || "done");
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysSince(date: Date | null, now: Date) {
  if (!date) return 0;
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function getDueDate(issue: IssueRow): Date | null {
  const labels = parseLabels(issue.labels);
  const dueLabel = labels.find((label) => label.toLowerCase().startsWith("due:"));
  if (!dueLabel) return null;
  const raw = dueLabel.slice(4).trim();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDueDateScore(dueDate: Date | null, now: Date) {
  if (!dueDate) return { score: 0, reason: "" };
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (daysUntil < 0) return { score: 45, reason: "Overdue" };
  if (daysUntil === 0) return { score: 40, reason: "Due today" };
  if (daysUntil === 1) return { score: 30, reason: "Due tomorrow" };
  if (daysUntil <= 7) return { score: 20, reason: "Due within 7 days" };
  return { score: 0, reason: "" };
}

function getStaleScore(updatedAt: Date | null, now: Date) {
  const age = daysSince(updatedAt, now);
  if (age >= 30) return { score: 25, reason: "No update in 30+ days" };
  if (age >= 14) return { score: 15, reason: "No update in 14+ days" };
  if (age >= 7) return { score: 8, reason: "No update in 7+ days" };
  return { score: 0, reason: "" };
}

function isBlocked(issue: IssueRow) {
  const text = `${issue.title} ${issue.description || ""} ${parseLabels(issue.labels).join(" ")}`.toLowerCase();
  return text.includes("blocked") || text.includes("blocker");
}

function isQuickWin(issue: IssueRow) {
  const text = `${issue.title} ${issue.description || ""}`.trim();
  return issue.priority !== "critical" && text.length < 120 && !isBlocked(issue);
}

function estimateBlocks(issue: IssueRow) {
  if (issue.priority === "critical" || issue.type === "feature") return 3;
  if (issue.priority === "high") return 2;
  return 1;
}

export function scoreIssue(issue: IssueRow, project: ProjectRow, now: Date): PulseScore {
  const reasons: string[] = [];
  let score = 0;

  const priorityScore = PRIORITY_WEIGHT[issue.priority] ?? 0;
  score += priorityScore;
  if (priorityScore > 0) reasons.push(`Priority is ${issue.priority}`);

  const statusScore = STATUS_WEIGHT[issue.status] ?? 0;
  score += statusScore;
  if (issue.status === "in_progress") reasons.push("Already in progress");
  if (issue.status === "in_review") reasons.push("Ready to review");

  const dueScore = getDueDateScore(getDueDate(issue), now);
  score += dueScore.score;
  if (dueScore.reason) reasons.push(dueScore.reason);

  const staleScore = getStaleScore(issue.updatedAt, now);
  score += staleScore.score;
  if (staleScore.reason) reasons.push(staleScore.reason);

  if (isQuickWin(issue)) {
    score += 5;
    reasons.push("Looks like a quick win");
  }

  if (isBlocked(issue)) {
    score -= 20;
    reasons.push("Blocked, so it is not ideal for focused work");
  }

  return {
    issue,
    project,
    score,
    reason: reasons.join(". ") || "Best available next action",
  };
}

async function persistSignals(scores: PulseScore[], now: Date) {
  const db = getDb();
  await Promise.all(scores.map((item) =>
    db.insert(issueSignalsTable)
      .values({
        issueId: item.issue.id,
        lastSuggestedAt: now,
        localScore: item.score,
        reason: item.reason,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: issueSignalsTable.issueId,
        set: {
          lastSuggestedAt: now,
          localScore: item.score,
          reason: item.reason,
          updatedAt: now,
        },
      })
  ));
}

function toPulseTask(item: PulseScore, order: number) {
  const dueDate = getDueDate(item.issue);
  return {
    issueId: item.issue.id,
    projectId: item.project.id,
    issueKey: issueKey(item.project, item.issue),
    title: item.issue.title,
    projectName: item.project.name,
    priority: item.issue.priority,
    status: item.issue.status,
    dueDate: dueDate ? dateOnly(dueDate) : null,
    reason: item.reason,
    order,
    estimateBlocks: estimateBlocks(item.issue),
    score: item.score,
  };
}

function getProjectNextActions(projects: ProjectRow[], issues: IssueRow[], scores: PulseScore[], doneStatusByProject: Map<string, string>) {
  return projects.map((project) => {
    const projectIssues = issues.filter((issue) => issue.projectId === project.id);
    const openIssues = projectIssues.filter((issue) => !isDoneStatus(issue, doneStatusByProject));
    const projectScores = scores.filter((item) => item.project.id === project.id);
    const staleIssues = openIssues.filter((issue) => daysSince(issue.updatedAt, new Date()) >= 14);
    const inProgress = projectScores.filter((item) => item.issue.status === "in_progress").sort((a, b) => b.score - a.score)[0];
    const highTodo = projectScores.filter((item) => item.issue.status === "todo" && ["critical", "high"].includes(item.issue.priority)).sort((a, b) => b.score - a.score)[0];
    const best = projectScores.sort((a, b) => b.score - a.score)[0];

    if (inProgress) {
      return {
        projectId: project.id,
        projectName: project.name,
        action: "Continue the highest-priority in-progress task",
        reason: inProgress.reason,
        issueId: inProgress.issue.id,
        issueKey: issueKey(project, inProgress.issue),
        issueTitle: inProgress.issue.title,
      };
    }

    if (highTodo) {
      return {
        projectId: project.id,
        projectName: project.name,
        action: "Start the strongest high-priority task",
        reason: highTodo.reason,
        issueId: highTodo.issue.id,
        issueKey: issueKey(project, highTodo.issue),
        issueTitle: highTodo.issue.title,
      };
    }

    if (staleIssues[0]) {
      return {
        projectId: project.id,
        projectName: project.name,
        action: "Review stale work and decide whether to continue or close it",
        reason: "This project has open work with no recent update",
        issueId: staleIssues[0].id,
        issueKey: issueKey(project, staleIssues[0]),
        issueTitle: staleIssues[0].title,
      };
    }

    if (openIssues.length === 0) {
      return {
        projectId: project.id,
        projectName: project.name,
        action: "Create a next task",
        reason: "This project has no open work queued",
        issueId: null,
        issueKey: null,
        issueTitle: null,
      };
    }

    return {
      projectId: project.id,
      projectName: project.name,
      action: "Work the highest-scored open issue",
      reason: best?.reason || "This is the best available next action",
      issueId: best?.issue.id || null,
      issueKey: best ? issueKey(project, best.issue) : null,
      issueTitle: best?.issue.title || null,
    };
  });
}

function makeRisk(type: string, severity: PulseRiskSeverity, title: string, description: string, suggestedFix: string, issueIds: string[], projectId?: string | null) {
  return { type, severity, title, description, suggestedFix, projectId: projectId || null, issueIds };
}

function getPulseRisks(projects: ProjectRow[], issues: IssueRow[], now: Date, doneStatusByProject: Map<string, string>) {
  const risks: ReturnType<typeof makeRisk>[] = [];
  const openIssues = issues.filter((issue) => !isDoneStatus(issue, doneStatusByProject));
  const overdue = openIssues.filter((issue) => {
    const due = getDueDate(issue);
    return due && dateOnly(due) < dateOnly(now);
  });
  const dueSoon = openIssues.filter((issue) => {
    const due = getDueDate(issue);
    if (!due) return false;
    const days = Math.round((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return days >= 0 && days <= 7;
  });
  const blocked = openIssues.filter(isBlocked);

  if (overdue.length > 0) {
    risks.push(makeRisk("overdue_issue", overdue.some((issue) => ["critical", "high"].includes(issue.priority)) ? "high" : "medium", `${overdue.length} issue${overdue.length === 1 ? " is" : "s are"} overdue`, "These issues have due dates in the past and are not done.", "Reschedule, complete, or deliberately defer them.", overdue.map((issue) => issue.id)));
  }

  if (dueSoon.length > 0) {
    risks.push(makeRisk("due_soon", "medium", `${dueSoon.length} issue${dueSoon.length === 1 ? " is" : "s are"} due soon`, "These issues are due within the next 7 days.", "Pull one into Today's Flow or update the due label.", dueSoon.map((issue) => issue.id)));
  }

  if (blocked.length > 0) {
    risks.push(makeRisk("blocked_issues", blocked.length >= 3 ? "high" : "medium", `${blocked.length} blocked issue${blocked.length === 1 ? "" : "s"}`, "Blocked work is reducing the quality of the daily plan.", "Resolve the blocker or move the issue out of active work.", blocked.map((issue) => issue.id)));
  }

  for (const project of projects) {
    const projectIssues = issues.filter((issue) => issue.projectId === project.id);
    const openProjectIssues = projectIssues.filter((issue) => !isDoneStatus(issue, doneStatusByProject));
    const inProgress = openProjectIssues.filter((issue) => issue.status === "in_progress");
    const latestUpdate = projectIssues.reduce<Date | null>((latest, issue) => {
      if (!issue.updatedAt) return latest;
      return !latest || issue.updatedAt > latest ? issue.updatedAt : latest;
    }, null);
    const projectAge = daysSince(latestUpdate || project.createdAt, now);

    if (inProgress.length > 3) {
      risks.push(makeRisk("too_much_wip", "medium", `${project.name} has too much work in progress`, `${inProgress.length} issues are in progress at once.`, "Finish or pause active work until WIP is below 3.", inProgress.map((issue) => issue.id), project.id));
    }

    if (openProjectIssues.length === 0) {
      risks.push(makeRisk("no_next_action", "low", `${project.name} has no next action`, "The project has no open issues queued.", "Create a concrete next task.", [], project.id));
    }

    if (projectIssues.length > 0 && projectAge >= 30) {
      risks.push(makeRisk("stale_project", "high", `${project.name} has no recent progress`, "No issue in this project has been updated in 30+ days.", "Review whether the project should continue, pause, or be closed.", projectIssues.map((issue) => issue.id), project.id));
    } else if (projectIssues.length > 0 && projectAge >= 14) {
      risks.push(makeRisk("stale_project", "medium", `${project.name} is getting stale`, "No issue in this project has been updated in 14+ days.", "Pick a small next action or archive stale work.", projectIssues.map((issue) => issue.id), project.id));
    }
  }

  return risks.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}

export async function computePulseToday(now = new Date()) {
  const db = getDb();
  const projects = await db.select().from(projectsTable).orderBy(projectsTable.createdAt);
  const issues = await db.select().from(issuesTable).orderBy(issuesTable.updatedAt);
  const statuses = await db.select().from(projectStatusesTable).orderBy(projectStatusesTable.position);
  const doneStatusByProject = new Map<string, string>();
  for (const project of projects) {
    const projectStatuses = statuses.filter((status) => status.projectId === project.id);
    doneStatusByProject.set(project.id, projectStatuses.at(-1)?.name || "done");
  }
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const openScores = issues
    .filter((issue) => !isDoneStatus(issue, doneStatusByProject))
    .map((issue) => {
      const project = projectById.get(issue.projectId);
      return project ? scoreIssue(issue, project, now) : null;
    })
    .filter((item): item is PulseScore => !!item)
    .sort((a, b) => b.score - a.score);

  await persistSignals(openScores, now);

  const selectedProjectIds = new Set<string>();
  const topTasks: ReturnType<typeof toPulseTask>[] = [];
  for (const item of openScores) {
    if (topTasks.length >= 3) break;
    const alreadySelected = selectedProjectIds.has(item.project.id);
    if (alreadySelected && projects.length > 1 && topTasks.length < 2) continue;
    topTasks.push(toPulseTask(item, topTasks.length + 1));
    selectedProjectIds.add(item.project.id);
  }

  return {
    date: dateOnly(now),
    topTasks,
    projectNextActions: getProjectNextActions(projects, issues, openScores, doneStatusByProject),
    risks: getPulseRisks(projects, issues, now, doneStatusByProject),
    reviewPrompt: "Close the loop by recording what finished, what started, and what should carry into tomorrow.",
  };
}

export async function recomputePulse(now = new Date()) {
  await computePulseToday(now);
  return { ok: true, computedAt: now };
}

export async function getIssueProject(issueId: string) {
  const db = getDb();
  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueId));
  if (!issue) return null;
  return { issue, projectId: issue.projectId };
}

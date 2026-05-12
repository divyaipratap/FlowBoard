import { Issue, IssuePriority, IssueType, Project } from "@workspace/api-client-react";

export type FocusItem = {
  issueId: string;
  projectId: string;
  addedAt: string;
  note?: string;
};

export type DecisionEntry = {
  id: string;
  projectId: string;
  title: string;
  context: string;
  decision: string;
  createdAt: string;
};

export type EffortMap = Record<string, "low" | "medium" | "high" | "deep" | "shallow">;

const FOCUS_KEY = "flowboard.focusQueue";
const DECISIONS_KEY = "flowboard.decisions";
const EFFORT_KEY = "flowboard.issueEffort";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("flowboard:storage", { detail: { key } }));
}

export function getFocusQueue(): FocusItem[] {
  return readJson<FocusItem[]>(FOCUS_KEY, []);
}

export function saveFocusQueue(items: FocusItem[]) {
  writeJson(FOCUS_KEY, items);
}

export function isIssueInFocus(issueId: string) {
  return getFocusQueue().some((item) => item.issueId === issueId);
}

export function toggleFocusIssue(issue: Issue) {
  const queue = getFocusQueue();
  const exists = queue.some((item) => item.issueId === issue.id);
  const next = exists
    ? queue.filter((item) => item.issueId !== issue.id)
    : [...queue, { issueId: issue.id, projectId: issue.projectId, addedAt: new Date().toISOString() }].slice(-5);
  saveFocusQueue(next);
  return !exists;
}

export function getDecisions(projectId: string): DecisionEntry[] {
  return readJson<DecisionEntry[]>(DECISIONS_KEY, [])
    .filter((entry) => entry.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addDecision(entry: Omit<DecisionEntry, "id" | "createdAt">) {
  const entries = readJson<DecisionEntry[]>(DECISIONS_KEY, []);
  const next = [
    {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    },
    ...entries,
  ];
  writeJson(DECISIONS_KEY, next);
}

export function getEffortMap(): EffortMap {
  return readJson<EffortMap>(EFFORT_KEY, {});
}

export function setIssueEffort(issueId: string, effort: EffortMap[string] | "none") {
  const map = getEffortMap();
  if (effort === "none") {
    delete map[issueId];
  } else {
    map[issueId] = effort;
  }
  writeJson(EFFORT_KEY, map);
}

export function getStaleIssues(issues: Issue[], days = 7) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return issues.filter((issue) => issue.status !== "done" && new Date(issue.updatedAt).getTime() < cutoff);
}

export function getQuickWins(issues: Issue[], effortMap = getEffortMap()) {
  return issues.filter((issue) =>
    issue.status !== "done" &&
    (issue.priority === IssuePriority.low || effortMap[issue.id] === "low" || effortMap[issue.id] === "shallow")
  );
}

export function buildMarkdownExport(project: Project, issues: Issue[], decisions: DecisionEntry[]) {
  const lines = [
    `# ${project.name}`,
    "",
    project.description || "No project description.",
    "",
    `Key: ${project.key}`,
    `Exported: ${new Date().toLocaleString()}`,
    "",
    "## Issues",
    "",
  ];

  for (const issue of issues) {
    lines.push(`### ${issue.issueKey}: ${issue.title}`);
    lines.push(`- Status: ${issue.status.replace("_", " ")}`);
    lines.push(`- Priority: ${issue.priority}`);
    lines.push(`- Type: ${issue.type}`);
    lines.push(`- Assignee: ${issue.assignee || "Unassigned"}`);
    lines.push("");
  }

  lines.push("## Decisions", "");
  if (decisions.length === 0) {
    lines.push("No decisions recorded.", "");
  } else {
    for (const decision of decisions) {
      lines.push(`### ${decision.title}`);
      lines.push(`- Date: ${new Date(decision.createdAt).toLocaleDateString()}`);
      lines.push(`- Context: ${decision.context || "None"}`);
      lines.push("");
      lines.push(decision.decision);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export const PROJECT_TEMPLATES = [
  {
    id: "software",
    name: "Software Project",
    issues: [
      { title: "Define scope and success criteria", type: IssueType.task, priority: IssuePriority.high },
      { title: "Set up implementation milestones", type: IssueType.task, priority: IssuePriority.medium },
      { title: "Create first test plan", type: IssueType.task, priority: IssuePriority.medium },
      { title: "Review risks and blockers", type: IssueType.bug, priority: IssuePriority.high },
    ],
  },
  {
    id: "content",
    name: "Content Plan",
    issues: [
      { title: "Choose topic and audience", type: IssueType.story, priority: IssuePriority.high },
      { title: "Draft outline", type: IssueType.task, priority: IssuePriority.medium },
      { title: "Create first draft", type: IssueType.feature, priority: IssuePriority.medium },
      { title: "Edit and publish", type: IssueType.task, priority: IssuePriority.high },
    ],
  },
  {
    id: "learning",
    name: "Learning Plan",
    issues: [
      { title: "Define learning goal", type: IssueType.story, priority: IssuePriority.high },
      { title: "Collect best resources", type: IssueType.task, priority: IssuePriority.medium },
      { title: "Practice with one small project", type: IssueType.feature, priority: IssuePriority.high },
      { title: "Write notes and next steps", type: IssueType.task, priority: IssuePriority.low },
    ],
  },
];

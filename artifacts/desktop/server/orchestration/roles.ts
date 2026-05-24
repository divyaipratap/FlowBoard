// FAB-12 — Role definitions and per-role tool allow-lists.
//
// Each role has a "narrowing" of the FlowBoard MCP tool surface. The base
// Agent Bridge permissions still apply on top — a role can never grant more
// access than the bridge already allows. The role only ever subtracts.
//
// Examples:
//   - reviewer can read tickets and add notes, but cannot move status
//   - tester can read tickets, attach worklogs/WorkProof, but not start
//   - planner can read tickets, add notes, propose follow-ups
//   - implementer keeps the full surface (subject to base permissions)

export const ROLES = ["implementer", "reviewer", "tester", "planner"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_STATUSES = ["pending", "ready", "in_progress", "done", "rejected"] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

/** Tools a role is allowed to invoke. Read tools are always implicit if the
 *  base permission `readTickets: allow` is set; this list governs writes. */
const ALLOWED_TOOLS_BY_ROLE: Record<Role, ReadonlySet<string>> = {
  implementer: new Set([
    "flowboard_get_today_tasks",
    "flowboard_get_issue",
    "flowboard_search_issues",
    "flowboard_start_issue",
    "flowboard_add_issue_note",
    "flowboard_update_issue_status",
    "flowboard_attach_work_summary",
    "flowboard_create_followup_issue",
  ]),
  reviewer: new Set([
    "flowboard_get_today_tasks",
    "flowboard_get_issue",
    "flowboard_search_issues",
    "flowboard_add_issue_note",
    "flowboard_attach_work_summary", // reviewer can attach a "review pass" summary
  ]),
  tester: new Set([
    "flowboard_get_today_tasks",
    "flowboard_get_issue",
    "flowboard_search_issues",
    "flowboard_add_issue_note",
    "flowboard_attach_work_summary", // attaches WorkProof from running tests
  ]),
  planner: new Set([
    "flowboard_get_today_tasks",
    "flowboard_get_issue",
    "flowboard_search_issues",
    "flowboard_add_issue_note",
    "flowboard_create_followup_issue",
  ]),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isRoleStatus(value: unknown): value is RoleStatus {
  return typeof value === "string" && (ROLE_STATUSES as readonly string[]).includes(value);
}

export function isToolAllowedForRole(role: Role, toolName: string): boolean {
  return ALLOWED_TOOLS_BY_ROLE[role].has(toolName);
}

/**
 * The natural ordering for handoff. `implementer` runs first; `reviewer`
 * gates the merge; `tester` gates the WorkProof check; `planner` ships
 * follow-ups. Roles that aren't on a particular ticket are skipped.
 */
export const HANDOFF_ORDER: readonly Role[] = ["planner", "implementer", "reviewer", "tester"];

/**
 * Fields whose writes are tracked for the conflict policy. These are the
 * fields where two agents racing produces user-visible damage if last-write
 * silently wins.
 */
export const TRACKED_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "type",
  "assignee",
  "labels",
] as const;

export type TrackedField = (typeof TRACKED_FIELDS)[number];

export function isTrackedField(value: unknown): value is TrackedField {
  return typeof value === "string" && (TRACKED_FIELDS as readonly string[]).includes(value);
}

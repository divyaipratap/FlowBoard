// FAB-12 — Orchestration gate: per-role tool exposure + field conflict policy.
//
// Sits between the bridge's permission check and the tool implementation.
// Applies two narrowings on top of the base AgentBridge permissions:
//
//   1) ROLE NARROWING. If the calling agent has an active role assignment on
//      this issue, the tool must be on the role's allowlist. A reviewer
//      calling `flowboard_update_issue_status` is rejected even if the bridge
//      is in trusted mode.
//
//   2) FIELD CONFLICT POLICY. If a *different* agent wrote any of the fields
//      this call would change within the conflict window, the call is
//      downgraded to a proposal even if the bridge would normally allow.
//      The user resolves it from the inbox.
//
// Both narrowings only ever subtract from what's already allowed. Neither
// can grant access the bridge has denied.

import { activeRoleFor } from "./assignments";
import { detectFieldConflict, type FieldWriteRecord } from "./fieldWrites";
import { isToolAllowedForRole, isTrackedField, type Role, type TrackedField } from "./roles";

export type GateOutcome =
  | { kind: "allow"; role: Role | null }
  | { kind: "deny"; reason: string; role: Role }
  | { kind: "force-proposal"; reason: string; conflict: FieldWriteRecord; role: Role | null };

export async function gateToolCall(opts: {
  agentName: string;
  toolName: string;
  issueId: string | null;
  /** Tracked field names this call WILL modify if it proceeds. */
  fieldsToWrite?: readonly TrackedField[];
}): Promise<GateOutcome> {
  const role = opts.issueId ? await activeRoleFor(opts.issueId, opts.agentName) : null;

  if (role && !isToolAllowedForRole(role, opts.toolName)) {
    return {
      kind: "deny",
      role,
      reason: `Role '${role}' is not allowed to call ${opts.toolName}. Reassign to an implementer or use a different role.`,
    };
  }

  if (opts.issueId && opts.fieldsToWrite && opts.fieldsToWrite.length > 0) {
    for (const field of opts.fieldsToWrite) {
      if (!isTrackedField(field)) continue;
      const conflict = await detectFieldConflict({
        issueId: opts.issueId,
        fieldName: field,
        agentName: opts.agentName,
      });
      if (conflict) {
        return {
          kind: "force-proposal",
          role,
          conflict,
          reason: `Field '${field}' was just written by ${conflict.lastWriterAgentName ?? "another agent"}. Last-writer-wins is rejected by FAB-12 conflict policy — opening a proposal so the user can resolve.`,
        };
      }
    }
  }

  return { kind: "allow", role };
}

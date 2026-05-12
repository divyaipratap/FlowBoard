## Flagship Feature 2: FlowBoard Agent Bridge

Build a local MCP server that lets coding agents such as Cursor, Codex, IntelliJ-based agents, and other MCP-compatible tools read and update FlowBoard tickets.

### Goal

Allow agents to:
- Read current tasks
- Understand issue context
- Start work on an issue
- Add progress notes
- Attach implementation summaries
- Mark issues complete
- Create follow-up issues

### Default Safety Mode

Use `suggest-only` mode by default. Agents can propose changes, but user approval is required before status updates or ticket creation are applied.

### MVP Tools

- `flowboard_get_today_tasks`
- `flowboard_get_issue`
- `flowboard_search_issues`
- `flowboard_start_issue`
- `flowboard_add_issue_note`
- `flowboard_update_issue_status`
- `flowboard_attach_work_summary`
- `flowboard_create_followup_issue`

### UI

Add Settings → Agent Bridge with:
- MCP server status
- Copy MCP config button
- Permission mode
- Allowed agents
- Agent activity log
- Disable writes toggle

### Acceptance Criteria

- Cursor can connect to FlowBoard MCP server.
- Codex can connect to FlowBoard MCP server.
- An agent can read today’s tasks.
- An agent can fetch a specific issue.
- An agent can add a work summary.
- An agent can suggest or apply a status update depending on permission mode.
- All agent actions are recorded in an audit log.


What can make it even better

The best improvement is to make it not just ticket sync, but a full agent work loop.

Better version of the idea
FlowBoard Agent Loop

The feature should support this complete workflow:

1. User starts with a codebase.
2. Agent scans the project.
3. Agent proposes tickets.
4. User approves tickets.
5. Agent claims a ticket.
6. Agent implements it.
7. Agent reports changed files, commands, tests, and summary.
8. FlowBoard marks the ticket done or asks for approval.
9. Agent creates follow-up tickets if needed.

That is the magical experience.

The most important improvement: approval workflow

Do not let agents directly create and complete everything by default.

The better UX is:

Agent proposes → FlowBoard reviews → User approves

Default mode should be:

Suggest-only

Later add:

Trusted agent mode

This makes the product feel safe. Since MCP tools can expose real actions to models, write permissions should be controlled carefully.

The best feature package

I would package it as three branded parts.

1. Agent Inbox

Where agent-suggested tickets appear.

Example:

Codex found 8 possible tasks in this repo:
- Add missing error state to Pulse page
- Write tests for issue scoring
- Fix stale cache after issue completion
- Add empty state for Agent Bridge settings

User actions:

Approve
Edit
Reject
Merge with existing ticket

This prevents noisy AI-generated backlogs.

2. Agent Worklog

Every ticket should get an automatic worklog.

Example:

Completed by Codex

Summary:
Implemented the Pulse task scoring API and connected it to the renderer.

Files changed:
- artifacts/desktop/server/pulse/computePulseToday.ts
- artifacts/desktop/src/features/pulse/PulsePage.tsx

Validation:
- Typecheck passed
- Renderer build passed

Follow-ups:
- Add unit tests for overdue task scoring

This is very valuable because it turns agent output into project history.

3. Agent Rules

Let users define how agents are allowed to interact with FlowBoard.

Example settings:

Agent permissions:
- Read tickets: allowed
- Create tickets: approval required
- Mark done: approval required
- Create follow-ups: approval required
- Delete tickets: never allowed

Later:

Allow Codex to auto-complete tickets only if:
- tests passed
- build passed
- files changed are attached
- completion summary is provided

This would make FlowBoard feel serious and trustworthy.

What I would build first

I would not start with IntelliJ/Cursor/Codex custom plugins.

Start with MCP only.

Build this MVP:

1. Local FlowBoard MCP server
2. Read project/issues tools
3. Propose ticket batch tool
4. Agent Inbox review UI
5. Approve selected tickets
6. Claim ticket tool
7. Add progress update tool
8. Complete ticket tool
9. Agent Worklog

That gives you a strong demo.

The killer demo

The product demo should be:

User opens Codex or Cursor:
"Analyze this repo and create FlowBoard tickets for what remains."

Agent scans project and sends 7 proposed tickets to FlowBoard.

User opens FlowBoard:
Reviews and approves 5 tickets.

User tells agent:
"Pick the highest-priority FlowBoard ticket and implement it."

Agent completes task.

FlowBoard automatically shows:
- ticket moved to Done
- summary attached
- changed files listed
- tests recorded
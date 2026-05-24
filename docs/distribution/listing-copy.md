# Distribution Listing Copy

## Short Description

FlowBoard is a local-first project board and MCP bridge that lets AI coding agents work from real tickets, attach WorkProof, and request auditable status changes.

## Long Description

FlowBoard turns AI-assisted coding into an inspectable operating loop. It combines a local Electron desktop app, SQLite project memory, a Today queue, Pulse prioritization, Agent Inbox approvals, structured worklogs, and a stdio MCP Agent Bridge for tools such as Cursor and Codex.

Agents can read the selected ticket, start work, search issues, attach implementation summaries, propose follow-up issues, and request status changes. The user stays in control through suggest-only mode, trusted-agent mode, write disables, activity logs, and WorkProof evidence for files changed, commands run, tests, and validation output.

## Tags

```text
mcp, project-management, ai-agents, cursor, codex, local-first, sqlite, worklog, workproof, productivity
```

## Registry Category

Developer tools, productivity, project management, agent orchestration.

## Install Copy

### Cursor

```json
{
  "mcpServers": {
    "flowboard": {
      "command": "node",
      "args": [
        "C:\\Users\\<you>\\AppData\\Local\\Programs\\FlowBoard\\resources\\app.asar.unpacked\\dist\\main\\mcp.js",
        "--api-port-file",
        "C:\\Users\\<you>\\AppData\\Roaming\\FlowBoard\\flowboard-api-port.json"
      ]
    }
  }
}
```

### Codex

```bash
codex mcp add flowboard -- node "<path-to-flowboard-mcp.js>" --api-port-file "<path-to-flowboard-api-port.json>"
```

## Tool List

| Tool | Purpose |
| --- | --- |
| `flowboard_get_today_tasks` | Read actionable tasks for the current day. |
| `flowboard_get_issue` | Fetch a FlowBoard issue by id or issue key. |
| `flowboard_search_issues` | Search issues by title, description, and optional status. |
| `flowboard_start_issue` | Claim a ticket and move it to in-progress when policy allows. |
| `flowboard_add_issue_note` | Add a ticket note or create an approval proposal. |
| `flowboard_update_issue_status` | Apply or propose a status update. |
| `flowboard_attach_work_summary` | Attach summary, changed files, commands, tests, follow-ups, and optional WorkProof. |
| `flowboard_create_followup_issue` | Create or propose follow-up work. |

## Security And Privacy Copy

FlowBoard runs locally. Project data is stored in SQLite on the user's machine, and the MCP bridge talks to a localhost API exposed by the running desktop app. The bridge supports suggest-only mode by default, trusted-agent mode for explicit automation, and a disable-writes switch that forces write tools into proposals.

## Screenshots

Use the prepared SVGs in `docs/distribution/screenshots/` for directory submissions:

| File | Caption |
| --- | --- |
| `flowboard-agent-bridge.svg` | Agent Bridge settings with MCP config, permission mode, and activity log. |
| `workproof-autocomplete.svg` | WorkProof attached to a ticket and enabling verified completion. |
| `cursor-demo-sequence.svg` | Cursor flow from MCP install to verified ticket completion. |


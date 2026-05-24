# MCP Registry Submissions

Snippets and notes for submitting FlowBoard's MCP Agent Bridge to the public MCP registries. The canonical machine-readable manifest lives at `packaging/mcp-registry/server.json`. This file holds the human-readable descriptions, screenshots references, and per-registry submission steps.

## Server identity

| Field | Value |
| --- | --- |
| Server name | `io.github.divyaipratap/flowboard` |
| Repository | https://github.com/divyaipratap/FlowBoard |
| Description | Local-first FlowBoard project memory and MCP Agent Bridge for AI coding agents. |
| Transport | stdio |
| Tools exposed | 8 (see "Tool list" below) |
| Required env | `FLOWBOARD_API_PORT_FILE` — path to the running app's port file |

## Tool list

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

## Anthropic Official MCP Registry

The official registry uses [`mcp-publisher`](https://github.com/modelcontextprotocol/registry) and a `server.json` file in the repo.

Submission steps (run from the repo root after a public release):

```bash
# 1. Initialize/refresh the manifest. Edit only if a field has changed.
mcp-publisher init --in packaging/mcp-registry/server.json

# 2. Sign in with the GitHub account that owns the repo namespace.
mcp-publisher login github

# 3. Publish.
mcp-publisher publish --in packaging/mcp-registry/server.json
```

Pre-flight checks:
- The npm package referenced as `__MCP_NPM_PACKAGE__` must already be published with the same version.
- The repository must be public.
- The `name` namespace (`io.github.divyaipratap`) must match the GitHub login of the publisher.

## Cursor MCP directory

Cursor curates a directory of MCP servers it features inside the IDE. Submission is via their public form / repo PR; copy and screenshots come from `listing-copy.md` and `screenshots/`.

Listing copy to paste:

```text
Name: FlowBoard
Tagline: Local-first project board + MCP bridge so Cursor works from real tickets.
Tags: project-management, ai-agents, cursor, codex, local-first, mcp
Homepage: https://github.com/divyaipratap/FlowBoard
Install: https://github.com/divyaipratap/FlowBoard#install
```

Cursor MCP config users will paste:

```json
{
  "mcpServers": {
    "flowboard": {
      "command": "node",
      "args": [
        "<path-to-flowboard-mcp.js>",
        "--api-port-file",
        "<path-to-flowboard-api-port.json>"
      ]
    }
  }
}
```

The desktop app's Settings page exposes a Copy MCP config button that fills in the absolute paths for the running install — that's the path of least friction for users.

## Codex MCP

OpenAI's Codex CLI accepts MCP server configuration but, as of 2026-05, did not host a public registry analogous to Anthropic's. Track at https://github.com/openai/codex.

Until then, the install instruction users follow is:

```bash
codex mcp add flowboard -- node "<path-to-flowboard-mcp.js>" --api-port-file "<path-to-flowboard-api-port.json>"
```

If/when a public Codex MCP registry opens, the Anthropic `server.json` is the closest portable starting point — the schema overlap is large.

## Submission timing

Do not submit any of these until:
1. A signed Windows installer and macOS DMG are published as a tagged GitHub Release.
2. The MCP transport package is published to npm under a stable name.
3. `__VERSION__`, `__MAC_DMG_SHA256__`, `__WINDOWS_EXE_SHA256__`, and `__MCP_NPM_PACKAGE__` placeholders are replaced everywhere under `packaging/`.

A submission with placeholder URLs gets rejected and consumes a review slot.

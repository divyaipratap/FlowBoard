# FlowBoard

**The local-first control room for AI-assisted builders.**

FlowBoard helps vibe coders turn scattered prompts, agent output, daily priorities, and half-finished implementation notes into one visible execution system. Plan the work, connect coding agents, approve proposals, track worklogs, and resume with full context.

> Build fast without losing the thread.

[Download from Releases](https://github.com/your-username/flowboard/releases/latest) · [Run Locally](#quick-start) · [Agent Bridge](#agent-bridge) · [Landing Page](#landing-page)

## Why FlowBoard

AI can generate work faster than humans can remember context. FlowBoard keeps that speed usable.

- **Project memory:** tickets, comments, attachments, subtasks, decisions, and worklogs stay together.
- **Daily focus:** Today and Pulse help you decide what deserves attention now.
- **Agent accountability:** Codex, Cursor, Claude, OpenAI, Ollama, and other MCP-compatible agents can work from visible tickets.
- **Approval-first workflow:** agent proposals can wait in Agent Inbox until you approve them.
- **Local-first storage:** desktop data lives in SQLite on your machine.

## Product Surfaces

```text
FlowBoard Desktop
  Local Electron app, SQLite data, local API, MCP Agent Bridge

FlowBoard Landing
  Premium marketing site with download CTA and supported-agent showcase

API + Generated Clients
  Contract-first API packages for web/SaaS surfaces
```

## Core Features

| Area | What it does |
| --- | --- |
| Boards | Kanban-style project planning with custom statuses and issue detail drawers |
| Today | Quick capture for ideas, tasks, reminders, and next actions |
| Pulse | Daily ranking for focus, risk, blockers, and momentum |
| Agent Bridge | MCP tools for agents to read tickets, start work, attach summaries, and propose follow-ups |
| Agent Inbox | Review, approve, reject, or merge agent-created proposals |
| Worklog | Structured history of files changed, commands run, tests, decisions, and follow-ups |

## Supported Agents

FlowBoard is designed for MCP-compatible workflows and includes landing-page assets for:

- Codex
- Cursor
- Claude / Anthropic
- OpenAI
- Ollama
- Google Antigravity

## Quick Start

Requirements:

- Node.js 20+
- pnpm 9+
- Python 3.x for native module builds
- Platform build tools for `better-sqlite3`

Install dependencies:

```bash
pnpm install
```

Run the desktop app:

```bash
pnpm run app
```

Run the landing page:

```bash
pnpm --filter @workspace/flowboard-landing run dev
```

Open the landing page at:

```text
http://127.0.0.1:5180/
```

## Agent Bridge

FlowBoard exposes a controlled local MCP bridge so agents can work from your actual plan instead of a loose chat prompt.

Agent tools include:

- `flowboard_get_today_tasks`
- `flowboard_get_issue`
- `flowboard_search_issues`
- `flowboard_start_issue`
- `flowboard_add_issue_note`
- `flowboard_update_issue_status`
- `flowboard_attach_work_summary`
- `flowboard_create_followup_issue`

Default mode is approval-first. Trusted mode can be enabled per action when you explicitly want agents to apply allowed updates directly.

## Repository Layout

```text
.
|-- artifacts/
|   |-- desktop/              Electron desktop app, local API, SQLite, MCP bridge
|   |-- flowboard-landing/    Premium public landing page
|   |-- saas-hero/            React web/SaaS surface
|   |-- api-server/           Express API server
|   `-- mockup-sandbox/       UI preview sandbox
|-- lib/
|   |-- api-spec/             OpenAPI contract
|   |-- api-client-react/     Generated React Query client
|   |-- api-zod/              Generated schemas
|   `-- db/                   Shared database schema
|-- scripts/                  Utility scripts and MCP smoke tests
|-- DESKTOP_BUILD.md          Desktop packaging guide
`-- package.json              Workspace scripts
```

## Useful Commands

```bash
pnpm run app
pnpm run desktop:build
pnpm run desktop:make
pnpm run typecheck
pnpm --filter @workspace/flowboard-landing run build
pnpm --filter @workspace/scripts run mcp:smoke -- --api http://127.0.0.1:3099/api
```

## Landing Page

The landing page lives in:

```text
artifacts/flowboard-landing
```

It includes:

- premium product storytelling
- animated app-screen stack
- supported-agent logo marquee
- release download CTA
- responsive desktop and mobile layout

For a clean open-source repository, installers are not committed. Publish packaged apps through GitHub Releases and update the release URL in `artifacts/flowboard-landing/src/main.tsx`.

## Packaging

See [DESKTOP_BUILD.md](DESKTOP_BUILD.md) for desktop packaging notes.

Common packaging commands:

```bash
pnpm run desktop:build
pnpm --filter @workspace/desktop run make:win
pnpm --filter @workspace/desktop run make:mac
pnpm --filter @workspace/desktop run make:linux
```

## Contributing

Contributions are welcome. Good first areas:

- improve Agent Bridge validation
- add more MCP client examples
- polish desktop accessibility
- add landing-page screenshots and release assets
- expand tests around agent proposals and worklogs

Before opening a pull request:

```bash
pnpm run typecheck
pnpm --filter @workspace/flowboard-landing run build
```

## License

MIT. See [LICENSE](LICENSE).

# FlowBoard — JIRA-like Project Management System

## Architecture

Full-stack monorepo (pnpm workspaces) with:
- **Frontend**: React + Vite + Tailwind at `artifacts/saas-hero` (served at `/`)
- **API Server**: Express + Drizzle ORM at `artifacts/api-server` (served at `/api`)
- **Database**: PostgreSQL via `DATABASE_URL` environment variable
- **Shared libs**: `lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`

## Key Files

### Frontend (`artifacts/saas-hero/src/`)
- `App.tsx` — Root with QueryClientProvider, wouter routing, Sidebar + main area
- `components/Sidebar.tsx` — Project list, nav, create project dialog trigger
- `components/KanbanBoard.tsx` — 4-column drag-drop board (To Do / In Progress / In Review / Done)
- `components/IssueCard.tsx` — Card with type icon, priority badge, assignee avatar, comment count
- `components/IssueDetailDrawer.tsx` — Right-side drawer: inline editing, status workflow, comments
- `components/CreateIssueDialog.tsx` — Modal with all issue fields
- `components/CreateProjectDialog.tsx` — Modal for new projects
- `pages/ProjectView.tsx` — Board header + summary stats + KanbanBoard
- `pages/Dashboard.tsx` — Welcome/landing (redirects to first project)

### API (`artifacts/api-server/src/routes/`)
- `health.ts` — GET /api/healthz
- `projects.ts` — CRUD /api/projects, GET /api/projects/:id/summary
- `issues.ts` — CRUD /api/projects/:projectId/issues, /api/issues/:id, comments

### Database (`lib/db/src/schema/`)
- `projects.ts` — id, name, key, description, color
- `issues.ts` — id, projectId, issueNumber, title, description, status, priority, type, assignee, reporter, labels[]
- `comments.ts` — id, issueId, content, author

## Contract-First API
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated React Query hooks: `lib/api-client-react/src/generated/api.ts`
- Generated Zod schemas: `lib/api-zod/src/generated/api.ts`
- Run codegen: `pnpm --filter @workspace/api-spec run codegen`
- **Important**: Do NOT re-run codegen — it overwrites `lib/api-zod/src/index.ts` with stale exports

## DB Operations
- Push schema changes: `pnpm --filter @workspace/db run push`
- Migrations stored in `lib/db/migrations/`

## Issue Status Values
`todo` | `in_progress` | `in_review` | `done`

## Priority Values
`low` | `medium` | `high` | `critical`

## Type Values
`task` | `bug` | `feature` | `story`

## Seeded Sample Data
- Project "FlowBoard Development" (key: FLW) — 8 issues across all statuses
- Project "Marketing Site" (key: MKT) — 3 issues
- Comments on FLW-1 and FLW-2

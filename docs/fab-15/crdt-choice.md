# FAB-15 — CRDT choice: Yjs vs Automerge

**Decision: Yjs.**

## Why Yjs

1. **Wire format.** Yjs ships small, binary, structurally-compressed updates. Per-edit overhead matters because each CRDT update gets encrypted (per `PeerCipher`) and sent over a relay; we pay a constant per-message envelope cost. Automerge's history-rich format is larger by default. For a board with frequent small status flips, Yjs wins on bandwidth.

2. **Relay maturity.** The `y-websocket` protocol is a well-documented public wire spec. Any compliant relay (including community-hosted instances) speaks it. This is exactly what FAB-15's "relay-only, no FlowBoard-hosted backend" requirement calls for — we encrypt above the protocol and treat the relay as a dumb pipe. Automerge's `@automerge/automerge-repo` has a sync-server model that's harder to point at arbitrary infrastructure.

3. **React bindings.** `y-react` / `yjs-react` patterns are well-trodden; we already have an SSE-based reactivity model in `use-flowboard-events.tsx` that we'll keep, but the optional bindings give us a fallback if SSE replay isn't precise enough.

4. **Bridge simplicity.** Our CRDT doc is a thin shadow of the SQLite source-of-truth (we don't move the database to CRDT, we mirror mutable fields into a Yjs doc and replay incoming updates back to SQLite). Yjs's shared types (`Y.Map`, `Y.Text`) map naturally onto our row-and-field model. Automerge's document-as-tree model is more powerful than we need.

## Trade-off accepted

Automerge gives us **rich history** (who changed what, when) for free. We're consciously declining that — our existing `issues.updatedAt` + audit log (`agent_actions` table) covers the audit need, and we'd be paying wire size in every sync round to get history we already have elsewhere.

If a future feature needs branching/merging of editable text fields (e.g., collaborative description editing with cursor presence), revisit. Yjs's `Y.Text` handles concurrent text edits well; full document branching is the case where Automerge would have been the better call.

## What we use from Yjs

- `Y.Doc` — one per **room** (a paired set of devices).
- `Y.Map<string, IssueShadow>` keyed by issue UUID, where `IssueShadow` holds the mutable fields (`title`, `description`, `status`, `priority`, `type`, `assignee`, `labels`).
- `Y.Text` for `title` and `description` to keep concurrent edits sane.
- Scalar map entries for `status`, `priority`, `type`, `assignee` — last-writer-wins per field, with **status** flagged for conflict UI when two writes happen within a short window (handled by `SyncEngine`, not Yjs itself).
- `Y.encodeStateAsUpdate` / `Y.applyUpdate` as the only public Yjs surface our transport sees — keeps the dependency contained.

## What we do *not* use from Yjs

- `y-websocket` client/server — we speak the protocol manually inside `RelayTransport` so we can wrap each frame in our own encryption envelope. Kiro implements this.
- `y-protocols/awareness` — out of scope for v1. No presence, no cursors, no "X is editing" indicators.
- `y-indexeddb` — we already persist in SQLite. The Yjs doc lives in memory and rebuilds from SQLite at startup.

## Versions

- `yjs` — pin to whatever satisfies the workspace `minimumReleaseAge: 1440` policy (see `pnpm-workspace.yaml`). Track A locks the version in `lib/sync/package.json` when implementing the bridge in Day 2.

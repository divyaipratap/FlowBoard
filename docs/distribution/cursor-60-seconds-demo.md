# Cursor In 60 Seconds Demo

Purpose: show a user installing FlowBoard MCP in Cursor, opening a real ticket, letting an agent attach WorkProof, and seeing the ticket auto-complete.

## Setup

1. Start FlowBoard Desktop.
2. Use a demo project named `FlowBoard Launch`.
3. Create issue `LAUNCH-7`: `Add empty-state polish to Today`.
4. Enable Agent Bridge trusted mode only for the demo profile.
5. Keep `Require green WorkProof to mark done` enabled.
6. Open Cursor with the FlowBoard repository.
7. Install the MCP config from FlowBoard Settings.

## Timeline

| Time | Visual | Voiceover |
| --- | --- | --- |
| 0-5s | Landing page hero and FlowBoard logo. | "FlowBoard gives AI coding agents a real project board." |
| 5-12s | FlowBoard Settings, Copy MCP config. | "Copy the local MCP bridge config from FlowBoard." |
| 12-20s | Cursor MCP JSON with `flowboard` server. | "Paste it into Cursor and the agent can see your selected tickets." |
| 20-30s | Cursor prompt: `Pick LAUNCH-7 and execute it.` | "Ask Cursor to work from the ticket, not from a loose prompt." |
| 30-42s | Agent reads issue, edits files, runs checks. | "The agent changes code and records exactly what it ran." |
| 42-52s | FlowBoard ticket worklog with WorkProof. | "WorkProof captures changed files, commands, exit codes, and environment." |
| 52-60s | Ticket moves to Done with verified badge. | "When the proof is green, FlowBoard can complete the ticket automatically." |

## On-Screen Prompt

```text
Pick LAUNCH-7 from FlowBoard, implement the requested polish, run validation, attach WorkProof, and mark the ticket done only if every check is green.
```

## Shot List

1. `flowboard-agent-bridge.svg` or captured Settings screen.
2. Cursor MCP config editor.
3. Cursor chat calling `flowboard_get_issue`.
4. Cursor terminal or checks panel.
5. FlowBoard issue worklog with WorkProof.
6. Done column with verified badge.

## Landing Page Embed Copy

Headline: `Cursor in 60 seconds`

Body: `Install the MCP bridge, pick a FlowBoard ticket from Cursor, attach WorkProof, and let FlowBoard complete only verified work.`

CTA: `Watch the demo`


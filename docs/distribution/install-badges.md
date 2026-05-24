# Install Badges and Snippets

Markdown snippets ready to paste into the root `README.md`, the landing page, or any blog post announcing FlowBoard. Replace `__VERSION__` once a release exists; everything else is final.

## One-line install

```markdown
**macOS:** `brew install --cask divyaipratap/flowboard/flowboard`
**Windows:** `winget install divyaipratap.FlowBoard`
**Windows (Scoop):** `scoop bucket add flowboard https://github.com/divyaipratap/scoop-flowboard && scoop install flowboard`
```

## Badges row

```markdown
[![Homebrew](https://img.shields.io/badge/Homebrew-FlowBoard-FBB040?logo=homebrew&logoColor=white)](https://github.com/divyaipratap/homebrew-flowboard)
[![winget](https://img.shields.io/badge/winget-FlowBoard-0078D4?logo=windows&logoColor=white)](https://github.com/microsoft/winget-pkgs/tree/master/manifests/d/divyaipratap/FlowBoard)
[![Scoop](https://img.shields.io/badge/Scoop-FlowBoard-555555?logo=scoop&logoColor=white)](https://github.com/divyaipratap/scoop-flowboard)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-flowboard-7c3aed?logo=anthropic&logoColor=white)](https://registry.modelcontextprotocol.io/io.github.divyaipratap/flowboard)
[![Cursor](https://img.shields.io/badge/Cursor-MCP-000000?logo=cursor&logoColor=white)](https://cursor.sh)
```

## Full install section

```markdown
## Install

FlowBoard ships as a desktop app and an MCP server. Install the desktop app first, then point your AI tool at the bundled MCP bridge.

### macOS

```bash
brew tap divyaipratap/flowboard
brew install --cask flowboard
```

### Windows

```powershell
winget install divyaipratap.FlowBoard
```

Or with Scoop:

```powershell
scoop bucket add flowboard https://github.com/divyaipratap/scoop-flowboard
scoop install flowboard
```

### Connect Cursor / Codex

Open FlowBoard, go to **Settings → Agent Bridge**, click **Copy MCP config**, and paste the JSON into your tool's MCP configuration. The config points at the local app — keys never leave your machine.
```

## Twitter / Bluesky launch tweet

```text
FlowBoard ships today.

A local-first project board + MCP bridge so AI coding agents work from real tickets, attach WorkProof, and only auto-complete verified work.

→ brew install --cask divyaipratap/flowboard/flowboard
→ winget install divyaipratap.FlowBoard

https://github.com/divyaipratap/FlowBoard
```

## Hacker News launch headline

```text
Show HN: FlowBoard – Local-first project board with an MCP bridge for AI agents
```

Body:

```text
FlowBoard is an Electron desktop app I built so AI coding agents (Cursor, Codex, Claude Code) work from real tickets instead of loose prompts. The whole thing is local — SQLite for project memory, no cloud account, no telemetry — and it ships an MCP server that exposes 8 tools (read tickets, attach WorkProof, propose status changes, request follow-ups).

The killer move is WorkProof: a hash-chained record of files changed, commands run, exit codes, and environment. You can require a green WorkProof before an agent can mark a ticket done. It turns "the agent says it's done" into "the agent attached evidence and the rules say it's done."

Optional team sync (FAB-15) is end-to-end encrypted via a public y-websocket relay — the relay sees ciphertext only, keys are derived from a 6-word pairing code on each device.

Install:
- macOS: brew install --cask divyaipratap/flowboard/flowboard
- Windows: winget install divyaipratap.FlowBoard

Repo: https://github.com/divyaipratap/FlowBoard
```

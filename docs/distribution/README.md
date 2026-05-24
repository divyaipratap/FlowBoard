# FlowBoard Distribution Kit

This directory contains the launch materials for publishing FlowBoard and its MCP Agent Bridge across MCP directories, package managers, and the public landing page.

## Contents

| File | Use |
| --- | --- |
| `README.md` | This file. Status overview + release values reference. |
| `listing-copy.md` | Long/short descriptions, tags, install copy for directories. |
| `mcp-registry.md` | Per-registry submission steps and JSON snippets. |
| `install-badges.md` | One-line install snippets, badges, and launch post drafts. |
| `cursor-60-seconds-demo.md` | 60-second demo storyboard, voiceover, and shot list. |
| `submission-checklist.md` | Step-by-step runbook for the live submissions that need accounts. |
| `screenshots/` | SVG placeholders + capture instructions for directory listings. |

The machine-readable manifests (Homebrew Cask, winget, Scoop, MCP registry `server.json`) live in `packaging/` at the repo root.

## Current Status

| Channel | Status | Owner action required |
| --- | --- | --- |
| Official MCP Registry | Prepared | Publish a public MCP package and run `mcp-publisher publish`. |
| Cursor MCP Directory | Prepared | Submit the repository/listing through Cursor's MCP server review flow. |
| Codex MCP | Prepared | Codex supports MCP server configuration; no public Codex MCP registry was found in official OpenAI docs as of 2026-05-21. |
| Homebrew tap | Prepared | Create `homebrew-flowboard`, replace release URL/hash, audit, and tag. |
| winget | Prepared | Replace release URL/hash in manifests and submit to `microsoft/winget-pkgs`. |
| Scoop bucket | Prepared | Create a Scoop bucket, replace release URL/hash, and test install. |
| Landing video | Prepared | Record the 60-second demo using `cursor-60-seconds-demo.md`. |
| Listing screenshots | Prepared | Use the SVG screenshots in `screenshots/` or replace them with captured app screenshots. |

## Release Values To Fill

These placeholders depend on a tagged GitHub Release and an npm publish. Replace them across `packaging/` and `docs/distribution/` before any submission. Static values (GitHub owner `divyaipratap`, repo `FlowBoard`) are already filled in.

```text
__VERSION__             Desktop app version, for example 1.0.0
__WINDOWS_EXE_URL__     HTTPS URL for FlowBoard Setup __VERSION__.exe
__WINDOWS_EXE_SHA256__  SHA256 for the Windows installer
__MAC_DMG_URL__         HTTPS URL for FlowBoard-__VERSION__.dmg
__MAC_DMG_SHA256__      SHA256 for the macOS installer
__MCP_NPM_PACKAGE__     Published MCP package name, for example @flowboard/mcp
__RELEASE_DATE__        ISO date the release was tagged, YYYY-MM-DD
```

Generate hashes from release artifacts:

```powershell
Get-FileHash "artifacts\desktop\release\FlowBoard Setup 1.0.0.exe" -Algorithm SHA256
Get-FileHash "artifacts\desktop\release\FlowBoard-1.0.0.dmg" -Algorithm SHA256
```

## One-Command Install Targets

macOS:

```bash
brew tap divyaipratap/flowboard
brew install --cask flowboard
```

Windows:

```powershell
winget install divyaipratap.FlowBoard
```

Windows alternate:

```powershell
scoop bucket add flowboard https://github.com/divyaipratap/scoop-flowboard
scoop install flowboard
```

## Submission Checklist

The full step-by-step runbook lives in `submission-checklist.md`. Headline summary:

1. Publish signed desktop installers with stable GitHub Release URLs.
2. Replace every release-dependent placeholder in `packaging/` and `docs/distribution/`.
3. Validate Homebrew cask with `brew audit --cask --new flowboard`.
4. Validate winget manifests with `winget validate packaging/winget/FlowBoard`.
5. Validate Scoop with `scoop install .\packaging\scoop\flowboard.json`.
6. Publish the MCP package to npm, then `mcp-publisher publish --in packaging/mcp-registry/server.json`.
7. Submit Cursor listing using copy from `listing-copy.md` and assets from `screenshots/`.
8. Record and publish the 60-second Cursor demo.

## Source Notes

- Official MCP Registry publishing uses `mcp-publisher`, `server.json`, and namespace/package ownership checks.
- Cursor's MCP directory accepts official provider submissions for review and supports install links/config.
- Homebrew taps install from Git repositories named `homebrew-<tap>`.
- winget submissions go through the `microsoft/winget-pkgs` repository after manifest validation.
- Scoop buckets are Git repositories containing JSON app manifests.


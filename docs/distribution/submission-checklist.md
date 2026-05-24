# FAB-9 Submission Checklist

Step-by-step runbook for taking FlowBoard from "ready to ship" to "submitted everywhere." Every prep file in this directory and `packaging/` is done; the items here all require accounts, a signed release, or a screen recording, so they can't be automated by an agent.

## 0. Prerequisites

- [ ] GitHub Release tagged `v__VERSION__` with both `FlowBoard Setup __VERSION__.exe` and `FlowBoard-__VERSION__.dmg` attached.
- [ ] MCP server published to npm as `__MCP_NPM_PACKAGE__` (or whatever name you reserved).
- [ ] SHA256 hashes captured:
  ```powershell
  Get-FileHash "artifacts/desktop/release/FlowBoard Setup __VERSION__.exe" -Algorithm SHA256
  Get-FileHash "artifacts/desktop/release/FlowBoard-__VERSION__.dmg" -Algorithm SHA256
  ```
- [ ] Replace placeholders across `packaging/` and `docs/distribution/`:
  - `__VERSION__`
  - `__WINDOWS_EXE_URL__`, `__WINDOWS_EXE_SHA256__`
  - `__MAC_DMG_URL__`, `__MAC_DMG_SHA256__`
  - `__MCP_NPM_PACKAGE__`
  - `__RELEASE_DATE__` (YYYY-MM-DD)

A handy one-liner once values are known:

```powershell
$values = @{
  '__VERSION__' = '1.0.0'
  '__WINDOWS_EXE_URL__' = 'https://github.com/divyaipratap/FlowBoard/releases/download/v1.0.0/FlowBoard.Setup.1.0.0.exe'
  '__WINDOWS_EXE_SHA256__' = '...'
  '__MAC_DMG_URL__' = 'https://github.com/divyaipratap/FlowBoard/releases/download/v1.0.0/FlowBoard-1.0.0.dmg'
  '__MAC_DMG_SHA256__' = '...'
  '__MCP_NPM_PACKAGE__' = '@flowboard/mcp'
  '__RELEASE_DATE__' = '2026-06-01'
}
Get-ChildItem -Recurse packaging, docs/distribution -Include *.rb, *.json, *.yaml, *.yml, *.md | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  foreach ($k in $values.Keys) { $content = $content.Replace($k, $values[$k]) }
  Set-Content -Path $_.FullName -Value $content -NoNewline -Encoding utf8
}
```

## 1. Homebrew tap (macOS)

- [ ] Create a new public repo `divyaipratap/homebrew-flowboard`.
- [ ] Copy `packaging/homebrew/Casks/flowboard.rb` into `Casks/flowboard.rb` of that repo.
- [ ] Validate locally: `brew audit --cask --new packaging/homebrew/Casks/flowboard.rb`
- [ ] Test install: `brew tap divyaipratap/flowboard && brew install --cask flowboard`
- [ ] Push & tag.

## 2. winget (Windows)

- [ ] Validate locally: `winget validate packaging/winget/FlowBoard`
- [ ] Test install: `winget install --manifest packaging/winget/FlowBoard`
- [ ] Fork `microsoft/winget-pkgs`, copy `packaging/winget/FlowBoard/*` to `manifests/d/divyaipratap/FlowBoard/__VERSION__/`.
- [ ] Open PR; the Azure pipelines validator runs automatically.

## 3. Scoop bucket (Windows alt)

- [ ] Create a new public repo `divyaipratap/scoop-flowboard`.
- [ ] Copy `packaging/scoop/flowboard.json` into the repo root.
- [ ] Test install:
  ```powershell
  scoop bucket add flowboard https://github.com/divyaipratap/scoop-flowboard
  scoop install flowboard
  ```
- [ ] Push & tag.

## 4. Anthropic MCP Registry

- [ ] `npm install -g @modelcontextprotocol/publisher`
- [ ] `mcp-publisher login github`
- [ ] `mcp-publisher publish --in packaging/mcp-registry/server.json`
- [ ] Confirm at https://registry.modelcontextprotocol.io/io.github.divyaipratap/flowboard

## 5. Cursor MCP directory

- [ ] Submit listing via Cursor's MCP server review form (URL in their docs; subject to change).
- [ ] Listing copy: `docs/distribution/listing-copy.md`
- [ ] Screenshots: `docs/distribution/screenshots/*.svg` (or capture real PNGs from the running app first).

## 6. Codex MCP

- [ ] Track https://github.com/openai/codex for a public registry.
- [ ] Until then, the user-facing instruction lives in the README install section.

## 7. "Cursor in 60 seconds" demo video

- [ ] Follow the storyboard in `docs/distribution/cursor-60-seconds-demo.md`.
- [ ] Record at 1920×1080 minimum.
- [ ] Export as both `.mp4` (for the landing page) and `.gif` (for README and social).
- [ ] Upload to the landing page (`artifacts/flowboard-landing/`) and link from the root README.

## 8. README & landing page updates

- [ ] Paste install snippets from `docs/distribution/install-badges.md` into the root README.
- [ ] Embed the demo video in the landing page hero.
- [ ] Add Hacker News / Twitter launch posts from `install-badges.md` to your launch queue.

## Post-submission

- [ ] Monitor each registry PR/review queue; respond within 48h to maintainer feedback.
- [ ] When approved, update FAB-9 to `done` and link the live URLs in a final issue note.
- [ ] Open a follow-up FlowBoard ticket "v1.1 distribution refresh" with reminders to bump versions across all five channels.

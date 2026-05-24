# FlowBoard Packaging Templates

These files are release-ready templates for the FAB-9 distribution work. They intentionally use placeholders because package-manager submissions need signed release artifact URLs and SHA256 hashes from the final GitHub Release.

## Files

| Path | Use |
| --- | --- |
| `homebrew/Casks/flowboard.rb` | Homebrew tap cask template. |
| `winget/FlowBoard/*.yaml` | Windows Package Manager manifest set. |
| `scoop/flowboard.json` | Scoop bucket manifest template. |
| `mcp-registry/server.json` | Official MCP Registry metadata template. |

## Validation

```bash
brew audit --cask --new packaging/homebrew/Casks/flowboard.rb
```

```powershell
winget validate packaging\winget\FlowBoard
scoop install .\packaging\scoop\flowboard.json
```


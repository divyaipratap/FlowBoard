# Agent Bridge MCP Validation

FlowBoard exposes a local MCP stdio bridge for Codex, Cursor, and other MCP-compatible clients. The desktop app must be running because the bridge forwards tool calls to the local FlowBoard API.

## Client Config

Use the config from **Settings -> Agent Bridge -> Copy MCP config**. In development it includes separate Codex and Cursor sections and should look like:

```json
{
  "mcpServers": {
    "flowboard": {
      "command": "node",
      "args": [
        "C:\\Users\\divya\\Downloads\\Team-Hero-Animation\\Team-Hero-Animation\\artifacts\\desktop\\dist\\main\\mcp.js",
        "--api-port-file",
        "C:\\Users\\divya\\AppData\\Roaming\\FlowBoard\\flowboard-api-port.json"
      ]
    }
  }
}
```

Codex and Cursor both use the same `command` and `args` shape. Cursor may wrap it under `mcpServers`; Codex may use the generated Codex section directly. The port file lets the MCP bridge connect to the current local API port after a restart, including packaged builds where FlowBoard may choose an available runtime port.

## Smoke Test

Build the MCP server first:

```bash
pnpm --filter @workspace/desktop run build:main
```

Run the smoke test against the running desktop app:

```bash
pnpm --filter @workspace/scripts run mcp:smoke -- --api http://127.0.0.1:3099/api
```

The script validates:

- `initialize`
- `tools/list`
- `flowboard_get_today_tasks`
- `flowboard_get_issue`
- `flowboard_attach_work_summary` in suggest-only mode
- `flowboard_update_issue_status` in suggest-only mode
- `flowboard_add_issue_note` in trusted mode

The script temporarily adds `MCP Smoke` to allowed agents and restores the previous Agent Bridge settings at the end.

## Known Limitations

- The desktop app must be running before the MCP process starts.
- Prefer the generated `--api-port-file` config. `--api http://127.0.0.1:3099/api` still works for manual development smoke tests, but can become stale in packaged builds.
- MCP uses stdio; clients should not expect a long-running HTTP MCP endpoint.
- Suggest-only writes create Agent Inbox proposals instead of applying directly.

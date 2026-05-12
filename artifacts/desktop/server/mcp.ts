import { FLOWBOARD_MCP_TOOLS } from "./agentTools";
import { readFileSync } from "fs";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function apiBaseUrl() {
  const explicitApi = getArgValue("--api") || process.env.FLOWBOARD_API_BASE;
  if (explicitApi) return explicitApi.replace(/\/$/, "");

  const portFile = getArgValue("--api-port-file") || process.env.FLOWBOARD_API_PORT_FILE;
  if (portFile) {
    const raw = readFileSync(portFile, "utf8");
    const parsed = JSON.parse(raw) as { port?: unknown; apiBase?: unknown };
    if (typeof parsed.apiBase === "string" && parsed.apiBase.trim()) return parsed.apiBase.replace(/\/$/, "");
    const port = Number(parsed.port);
    if (Number.isFinite(port) && port > 0) return `http://127.0.0.1:${port}/api`;
    throw new Error(`Invalid FlowBoard API port file: ${portFile}`);
  }

  return "http://127.0.0.1:3099/api";
}

function respond(id: JsonRpcRequest["id"], result: unknown) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id: JsonRpcRequest["id"], error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } })}\n`);
}

async function handleRequest(request: JsonRpcRequest) {
  if (request.method === "initialize") {
    respond(request.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "flowboard-agent-bridge", version: "0.1.0" },
    });
    return;
  }

  if (request.method === "notifications/initialized") return;

  if (request.method === "tools/list") {
    respond(request.id, { tools: FLOWBOARD_MCP_TOOLS });
    return;
  }

  if (request.method === "tools/call") {
    const params = request.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const response = await fetch(`${apiBaseUrl()}/agent-bridge/tools/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error ?? `FlowBoard API returned ${response.status}`);
    respond(request.id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    });
    return;
  }

  respondError(request.id, `Unsupported MCP method: ${request.method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    void (async () => {
      try {
        await handleRequest(JSON.parse(line) as JsonRpcRequest);
      } catch (error) {
        respondError(null, error);
      }
    })();
  }
});

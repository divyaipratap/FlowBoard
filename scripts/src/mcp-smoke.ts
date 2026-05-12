import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonRpcResponse = {
  id?: number | string | null;
  result?: any;
  error?: { message?: string };
};

type Settings = {
  permissionMode: "suggest-only" | "trusted";
  allowedAgents: string[];
  disableWrites: boolean;
  permissions?: Record<string, unknown>;
};

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const apiBase = (args.get("--api") || process.env.FLOWBOARD_API_BASE || "http://127.0.0.1:3099/api").replace(/\/$/, "");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mcpPath = args.get("--mcp") || path.resolve(repoRoot, "artifacts/desktop/dist/main/mcp.js");
const agentName = args.get("--agent") || "MCP Smoke";

let nextId = 1;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${url}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(body?.error || `${response.status} ${response.statusText}`);
  return body as T;
}

function waitForResponse(child: ChildProcessWithoutNullStreams, id: number) {
  return new Promise<JsonRpcResponse>((resolve, reject) => {
    let buffer = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for JSON-RPC response ${id}`));
    }, 10000);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as JsonRpcResponse;
        if (parsed.id === id) {
          cleanup();
          if (parsed.error) reject(new Error(parsed.error.message || "MCP error"));
          else resolve(parsed);
          return;
        }
      }
    };

    const onExit = () => {
      cleanup();
      reject(new Error(`MCP process exited before responding${stderr ? `: ${stderr.trim()}` : ""}`));
    };

    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
  });
}

async function rpc(child: ChildProcessWithoutNullStreams, method: string, params?: Record<string, unknown>) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return waitForResponse(child, id);
}

async function callTool(child: ChildProcessWithoutNullStreams, name: string, toolArgs: Record<string, unknown>) {
  const response = await rpc(child, "tools/call", { name, arguments: { agentName, ...toolArgs } });
  return response.result?.structuredContent;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  await api("/healthz");
  const originalSettings = await api<Settings>("/agent-bridge/settings");
  const projects = await api<Array<{ id: string; name: string }>>("/projects");
  assert(projects.length > 0, "FlowBoard needs at least one project for the MCP smoke test");
  const projectId = args.get("--project-id") || projects[0].id;
  const issues = await api<Array<{ id: string; issueKey: string; status: string }>>(`/projects/${projectId}/issues`);
  assert(issues.length > 0, "FlowBoard needs at least one issue for the MCP smoke test");
  const issue = issues.find((item) => item.status !== "done") || issues[0];

  await api("/agent-bridge/settings", {
    method: "PUT",
    body: JSON.stringify({
      ...originalSettings,
      permissionMode: "suggest-only",
      allowedAgents: Array.from(new Set([...(originalSettings.allowedAgents || []), agentName])),
      disableWrites: false,
      permissions: {
        ...(originalSettings.permissions || {}),
        readTickets: "allow",
        updateStatus: "approval",
        attachWorkSummaries: "approval",
        addNotes: "approval",
        createFollowUps: "approval",
      },
    }),
  });

  const child = spawn(process.execPath, [mcpPath, "--api", apiBase], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    const initialized = await rpc(child, "initialize", { clientInfo: { name: "flowboard-smoke" } });
    assert(initialized.result?.serverInfo?.name === "flowboard-agent-bridge", "initialize returned unexpected server");

    const tools = await rpc(child, "tools/list");
    const toolNames = new Set((tools.result?.tools || []).map((tool: { name: string }) => tool.name));
    for (const name of ["flowboard_get_today_tasks", "flowboard_get_issue", "flowboard_attach_work_summary", "flowboard_update_issue_status"]) {
      assert(toolNames.has(name), `Missing MCP tool: ${name}`);
    }

    const today = await callTool(child, "flowboard_get_today_tasks", { limit: 5 });
    assert(Array.isArray(today?.tasks), "get_today_tasks did not return a task list");

    const fetchedIssue = await callTool(child, "flowboard_get_issue", { issueKey: issue.issueKey });
    assert(fetchedIssue?.id === issue.id, "get_issue did not fetch the expected issue");

    const summaryProposal = await callTool(child, "flowboard_attach_work_summary", {
      issueKey: issue.issueKey,
      summary: "MCP smoke test summary",
      changedFiles: ["scripts/src/mcp-smoke.ts"],
      commandsRun: ["pnpm --filter @workspace/scripts run mcp:smoke"],
      testsRun: ["MCP JSON-RPC smoke"],
    });
    assert(summaryProposal?.approvalRequired === true && summaryProposal?.proposalId, "attach_work_summary did not create a suggest-only proposal");

    const statusProposal = await callTool(child, "flowboard_update_issue_status", {
      issueKey: issue.issueKey,
      status: issue.status,
    });
    assert(statusProposal?.approvalRequired === true && statusProposal?.proposalId, "status update did not create a suggest-only proposal");

    await api("/agent-bridge/settings", {
      method: "PUT",
      body: JSON.stringify({
        ...originalSettings,
        permissionMode: "trusted",
        allowedAgents: Array.from(new Set([...(originalSettings.allowedAgents || []), agentName])),
        disableWrites: false,
        permissions: {
          ...(originalSettings.permissions || {}),
          readTickets: "allow",
          addNotes: "allow",
        },
      }),
    });

    const appliedNote = await callTool(child, "flowboard_add_issue_note", {
      issueKey: issue.issueKey,
      note: "MCP smoke test trusted write.",
    });
    assert(appliedNote?.applied === true && appliedNote?.comment?.id, "trusted add_issue_note did not apply");

    console.log(JSON.stringify({
      ok: true,
      apiBase,
      mcpPath,
      projectId,
      issueKey: issue.issueKey,
      validated: ["initialize", "tools/list", "get_today_tasks", "get_issue", "suggest-only work summary", "suggest-only status update", "trusted note write"],
    }, null, 2));
  } finally {
    child.kill();
    await api("/agent-bridge/settings", {
      method: "PUT",
      body: JSON.stringify(originalSettings),
    }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import * as fs from "fs";
import path from "path";

export type McpClientConfig = {
  command: string;
  args: string[];
};

export type McpConfig = {
  cursor: {
    mcpServers: {
      flowboard: McpClientConfig;
    };
  };
  codex: {
    mcpServers: {
      flowboard: McpClientConfig;
    };
  };
  details: {
    mcpScript: string;
    apiPortFile?: string;
    apiBase?: string;
  };
};

function packagedUnpackedMcpPath() {
  if (!process.resourcesPath) return null;
  return path.join(process.resourcesPath, "app.asar.unpacked", "dist", "main", "mcp.js");
}

export function resolveMcpCommandPath(baseDir = __dirname) {
  if (process.env.FLOWBOARD_MCP_PATH) return process.env.FLOWBOARD_MCP_PATH;

  const unpackedPath = packagedUnpackedMcpPath();
  if (unpackedPath && fs.existsSync(unpackedPath)) return unpackedPath;

  return path.join(baseDir, "mcp.js");
}

export function createMcpConfig(): McpConfig {
  const command = process.env.FLOWBOARD_NODE_PATH || "node";
  const mcpScript = resolveMcpCommandPath();
  const apiPortFile = process.env.FLOWBOARD_API_PORT_FILE;
  const apiBase = `http://127.0.0.1:${process.env.FLOWBOARD_SERVER_PORT || "3099"}/api`;
  const args = apiPortFile
    ? [mcpScript, "--api-port-file", apiPortFile]
    : [mcpScript, "--api", apiBase];
  const clientConfig = { command, args };

  return {
    cursor: {
      mcpServers: {
        flowboard: clientConfig,
      },
    },
    codex: {
      mcpServers: {
        flowboard: clientConfig,
      },
    },
    details: {
      mcpScript,
      ...(apiPortFile ? { apiPortFile } : { apiBase }),
    },
  };
}

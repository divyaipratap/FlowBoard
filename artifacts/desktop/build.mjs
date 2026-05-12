import { build as esbuild } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const external = [
  "electron",
  "better-sqlite3",
  "*.node",
];

async function buildAll() {
  // Build main process
  await esbuild({
    entryPoints: [path.resolve(__dirname, "electron/main.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(__dirname, "dist/main/index.js"),
    external,
    sourcemap: "linked",
    logLevel: "info",
  });

  // Build MCP stdio server for Cursor, Codex, and other MCP clients
  await esbuild({
    entryPoints: [path.resolve(__dirname, "server/mcp.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(__dirname, "dist/main/mcp.js"),
    external,
    sourcemap: "linked",
    logLevel: "info",
  });

  // Build preload
  await esbuild({
    entryPoints: [path.resolve(__dirname, "electron/preload.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(__dirname, "dist/preload/index.js"),
    external: ["electron"],
    sourcemap: "linked",
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});

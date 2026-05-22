/**
 * Desktop dev script.
 *
 * 1. Builds the main process bundle (so server/* changes since last build are picked up).
 * 2. Starts the Vite renderer dev server, waits for it.
 * 3. Launches Electron.
 * 4. Watches main-process sources; on rebuild, restarts Electron.
 *
 * Run with: node dev.mjs
 */
import { spawn, exec } from "node:child_process";
import http from "node:http";
import { buildAll, watchMain } from "./build.mjs";

const RENDERER_PORT = 5174;
const isWin = process.platform === "win32";

function waitForServer(url, retries = 30, delayMs = 500) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      http
        .get(url, () => resolve())
        .on("error", () => {
          if (n <= 0) reject(new Error(`Timed out waiting for ${url}`));
          else setTimeout(() => attempt(n - 1), delayMs);
        });
    }
    attempt(retries);
  });
}

function killTree(proc) {
  if (!proc || proc.killed || proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    if (isWin && proc.pid) {
      exec(`taskkill /PID ${proc.pid} /T /F`, () => resolve());
    } else {
      proc.kill();
      setTimeout(resolve, 150);
    }
  });
}

let viteProc = null;
let electronProc = null;
let restarting = false;
let shuttingDown = false;

function launchElectron() {
  const env = { ...process.env, NODE_ENV: "development" };
  delete env.ELECTRON_RUN_AS_NODE;
  const proc = spawn("pnpm", ["electron", "dist/main/index.js"], {
    stdio: "inherit",
    shell: true,
    env,
  });
  proc.on("close", () => {
    if (restarting || shuttingDown) {
      restarting = false;
      return;
    }
    // User-initiated quit — tear everything down.
    shuttingDown = true;
    viteProc?.kill();
    process.exit(0);
  });
  return proc;
}

async function restartElectron() {
  if (!electronProc || restarting || shuttingDown) return;
  console.log("[dev] Main rebuilt — restarting Electron…");
  restarting = true;
  const old = electronProc;
  electronProc = null;
  await killTree(old);
  if (shuttingDown) return;
  electronProc = launchElectron();
}

async function main() {
  console.log("[dev] Building main process bundle…");
  await buildAll();

  viteProc = spawn("pnpm", ["vite", "--config", "vite.renderer.config.ts"], {
    stdio: "inherit",
    shell: true,
  });

  console.log(`[dev] Waiting for Vite renderer on port ${RENDERER_PORT}…`);
  await waitForServer(`http://localhost:${RENDERER_PORT}`);

  console.log("[dev] Renderer ready — launching Electron…");
  electronProc = launchElectron();

  console.log("[dev] Watching server/ and electron/ for changes…");
  await watchMain(() => {
    restartElectron().catch((err) => console.error("[dev] restart failed:", err));
  });
}

main().catch((err) => {
  console.error(err);
  viteProc?.kill();
  process.exit(1);
});

process.on("SIGINT", async () => {
  shuttingDown = true;
  if (electronProc) await killTree(electronProc);
  viteProc?.kill();
  process.exit(0);
});

/**
 * Desktop dev script.
 * Starts the Vite renderer dev server, waits for it, then launches Electron.
 * Run with: node dev.mjs
 */
import { spawn } from "node:child_process";
import http from "node:http";

const RENDERER_PORT = 5174;

function waitForServer(url, retries = 30, delayMs = 500) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      http
        .get(url, (res) => {
          resolve();
        })
        .on("error", () => {
          if (n <= 0) {
            reject(new Error(`Timed out waiting for ${url}`));
          } else {
            setTimeout(() => attempt(n - 1), delayMs);
          }
        });
    }
    attempt(retries);
  });
}

// Start Vite renderer dev server
const vite = spawn(
  "pnpm",
  ["vite", "--config", "vite.renderer.config.ts"],
  { stdio: "inherit", shell: true }
);

console.log(`[dev] Waiting for Vite renderer on port ${RENDERER_PORT}...`);

waitForServer(`http://localhost:${RENDERER_PORT}`)
  .then(() => {
    console.log("[dev] Renderer ready — launching Electron...");
    const electron = spawn(
      "pnpm",
      ["electron", "dist/main/index.js"],
      { stdio: "inherit", shell: true, env: { ...process.env, NODE_ENV: "development" } }
    );
    electron.on("close", () => {
      vite.kill();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error(err.message);
    vite.kill();
    process.exit(1);
  });

process.on("SIGINT", () => {
  vite.kill();
  process.exit(0);
});

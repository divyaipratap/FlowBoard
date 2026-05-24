import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const tempDir = path.resolve(".marketplace-test-build");
const outfile = path.join(tempDir, "marketplace.test.cjs");

try {
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  await build({
    entryPoints: [path.resolve("server/marketplace/marketplace.test.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    external: ["better-sqlite3", "*.node", "electron"],
    logLevel: "silent",
    sourcemap: "inline",
  });

  const electron = require("electron");
  const child = spawn(electron, ["--test", outfile], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  const code = await new Promise((resolve) => child.on("close", resolve));
  process.exitCode = typeof code === "number" ? code : 1;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

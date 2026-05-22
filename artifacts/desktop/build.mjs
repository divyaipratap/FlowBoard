import { build as esbuild, context as esbuildContext } from "esbuild";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const external = [
  "electron",
  "better-sqlite3",
  "*.node",
];

function mainConfig() {
  return {
    entryPoints: [path.resolve(__dirname, "electron/main.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(__dirname, "dist/main/index.js"),
    external,
    sourcemap: "linked",
    logLevel: "info",
  };
}

function mcpConfig() {
  return {
    entryPoints: [path.resolve(__dirname, "server/mcp.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(__dirname, "dist/main/mcp.js"),
    external,
    sourcemap: "linked",
    logLevel: "info",
  };
}

function preloadConfig() {
  return {
    entryPoints: [path.resolve(__dirname, "electron/preload.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(__dirname, "dist/preload/index.js"),
    external: ["electron"],
    sourcemap: "linked",
    logLevel: "info",
  };
}

export async function buildAll() {
  await esbuild(mainConfig());
  await esbuild(mcpConfig());
  await esbuild(preloadConfig());
}

// Watch the main-process bundle (electron/main.ts + everything it imports).
// Calls `onRebuild` after each successful incremental build. The initial build
// is skipped here — assume the caller already ran buildAll() to seed dist/.
export async function watchMain(onRebuild) {
  const ctx = await esbuildContext({
    ...mainConfig(),
    plugins: [
      {
        name: "fab15-dev-watcher",
        setup(build) {
          let isFirst = true;
          build.onEnd((result) => {
            if (isFirst) {
              isFirst = false;
              return;
            }
            if (result.errors.length === 0) {
              onRebuild();
            } else {
              console.error("[dev] rebuild failed:", result.errors);
            }
          });
        },
      },
    ],
  });
  await ctx.watch();
  return async () => ctx.dispose();
}

// CLI: `node build.mjs` still works for one-shot production builds.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  buildAll().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

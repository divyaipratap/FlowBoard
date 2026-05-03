import { build as esbuild } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, mkdirSync } from "node:fs";

globalThis.require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const external = [
  "electron",
  "better-sqlite3",
  "*.node",
];

const banner = {
  js: `import { createRequire as __cr } from 'node:module';
import __path from 'node:path';
import __url from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __url.fileURLToPath(import.meta.url);
globalThis.__dirname = __path.dirname(globalThis.__filename);
`,
};

async function buildAll() {
  // Build main process
  await esbuild({
    entryPoints: [path.resolve(__dirname, "electron/main.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.resolve(__dirname, "dist/main/index.js"),
    external,
    sourcemap: "linked",
    banner,
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

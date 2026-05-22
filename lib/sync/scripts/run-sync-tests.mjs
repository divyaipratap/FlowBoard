import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const testRoot = path.join(root, process.argv[2] ?? "src");
const tests = await findTests(testRoot);

if (tests.length === 0) {
  console.error("No sync tests found.");
  process.exit(1);
}

await Promise.all(tests.map((file) => import(pathToFileURL(file).href)));

async function findTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findTests(fullPath)));
    } else if (entry.isFile() && /\.(test)\.[cm]?[jt]s$/u.test(entry.name)) {
      matches.push(fullPath);
    }
  }

  return matches;
}

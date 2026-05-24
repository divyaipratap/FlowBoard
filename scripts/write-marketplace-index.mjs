// Generate the marketplace index.json from templates/marketplace/<handle>/<id>/manifest.json.
// The output is the static manifest the in-app browser fetches.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const templatesRoot = path.join(repoRoot, "templates", "marketplace");
const outFile = path.join(repoRoot, "templates", "marketplace", "index.json");

// Hosted manifest base URL — points at this repo's main branch raw content.
// Replace once a dedicated marketplace repo exists.
const HOSTED_BASE = "https://raw.githubusercontent.com/divyaipratap/FlowBoard/main/templates/marketplace";

async function loadManifest(handleDir, templateDir) {
  const manifestPath = path.join(templatesRoot, handleDir, templateDir, "manifest.json");
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const templates = [];
  const handles = await readdir(templatesRoot, { withFileTypes: true });

  for (const handle of handles) {
    if (!handle.isDirectory()) continue;
    const templateEntries = await readdir(path.join(templatesRoot, handle.name), { withFileTypes: true });
    for (const t of templateEntries) {
      if (!t.isDirectory()) continue;
      try {
        const manifest = await loadManifest(handle.name, t.name);
        templates.push({
          id: manifest.id,
          name: manifest.name,
          description: manifest.description,
          version: manifest.version,
          author: manifest.author,
          tags: manifest.tags ?? [],
          manifestUrl: `${HOSTED_BASE}/${handle.name}/${t.name}/manifest.json`,
          downloads: 0,
        });
      } catch (err) {
        console.error(`Skipping ${handle.name}/${t.name}:`, err.message);
      }
    }
  }

  templates.sort((a, b) => a.id.localeCompare(b.id));

  const index = {
    version: 1,
    updatedAt: new Date().toISOString(),
    templates,
  };

  await writeFile(outFile, JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log(`Wrote ${templates.length} templates to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

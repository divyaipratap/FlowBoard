// Validate every starter-pack template against the JSON schemas. Run via
// `node scripts/validate-marketplace-templates.mjs`. Exits non-zero on any
// validation failure. Designed to be wired into CI.

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const schemasDir = path.join(repoRoot, "docs", "marketplace", "schemas");
const templatesRoot = path.join(repoRoot, "templates", "marketplace");

// Tiny dependency-free JSON-schema subset just for the marketplace shapes.
// We control both the schemas and the inputs, so a full validator would be
// over-engineered. The check covers: required fields, type, enum, pattern,
// additionalProperties=false, and nested objects/arrays via recursion.
function validate(value, schema, pathSoFar = "$") {
  const errs = [];
  if (schema.enum && !schema.enum.includes(value)) {
    errs.push(`${pathSoFar} must be one of ${JSON.stringify(schema.enum)} (got ${JSON.stringify(value)})`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (!types.includes(actual) && !(actual === "number" && types.includes("integer") && Number.isInteger(value))) {
      errs.push(`${pathSoFar} must be ${types.join("|")} (got ${actual})`);
    }
  }
  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value)) {
    errs.push(`${pathSoFar} must match /${schema.pattern}/ (got ${JSON.stringify(value)})`);
  }
  if (schema.minLength != null && typeof value === "string" && value.length < schema.minLength) {
    errs.push(`${pathSoFar} too short (min ${schema.minLength})`);
  }
  if (schema.maxLength != null && typeof value === "string" && value.length > schema.maxLength) {
    errs.push(`${pathSoFar} too long (max ${schema.maxLength})`);
  }
  if (schema.minimum != null && typeof value === "number" && value < schema.minimum) {
    errs.push(`${pathSoFar} below minimum ${schema.minimum}`);
  }
  if (schema.maximum != null && typeof value === "number" && value > schema.maximum) {
    errs.push(`${pathSoFar} above maximum ${schema.maximum}`);
  }
  if (schema.required && typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const k of schema.required) {
      if (!(k in value)) errs.push(`${pathSoFar}.${k} is required`);
    }
  }
  if (schema.properties && typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [k, child] of Object.entries(schema.properties)) {
      if (k in value) errs.push(...validate(value[k], child, `${pathSoFar}.${k}`));
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!(k in schema.properties)) errs.push(`${pathSoFar}.${k} is not allowed (additionalProperties: false)`);
      }
    }
  }
  if (schema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      errs.push(...validate(value[i], schema.items, `${pathSoFar}[${i}]`));
    }
  }
  return errs;
}

// Tiny YAML reader: handles the subset we use in starter pack files. For
// real validation in CI we'd pull in a YAML library, but pnpm's release-age
// policy means new deps need lead time. The starter pack is hand-curated so
// this works for now. Recipes use `>-` and `|` block scalars and arrays —
// supported below.
function parseYaml(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, container: root }];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }
    const indent = line.length - line.trimStart().length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1].container;
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      // list item
      if (!Array.isArray(top.__items__)) top.__items__ = [];
      const v = trimmed.slice(2);
      top.__items__.push(coerce(v));
      i++;
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) { i++; continue; }
    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (rest === "" || rest === ">-" || rest === "|") {
      // could be block scalar OR nested object
      const nextIndentLine = lines.slice(i + 1).find((l) => l.trim() && !l.trim().startsWith("#"));
      const nextIndent = nextIndentLine ? nextIndentLine.length - nextIndentLine.trimStart().length : indent;
      if (rest === ">-" || rest === "|") {
        // block scalar — gather lines with greater indent
        const buf = [];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          const nextI = next.length - next.trimStart().length;
          if (next.trim() === "") { buf.push(""); i++; continue; }
          if (nextI <= indent) break;
          buf.push(next.slice(nextIndent));
          i++;
        }
        top[key] = rest === "|" ? buf.join("\n") : buf.join(" ").trim();
        continue;
      }
      const child = nextIndent > indent && nextIndentLine && nextIndentLine.trim().startsWith("- ") ? [] : {};
      top[key] = child;
      stack.push({ indent, container: child });
      i++;
      continue;
    }

    top[key] = coerce(rest);
    i++;
  }
  // Promote any container that gathered list items into a real array.
  return promoteLists(root);
}

function coerce(s) {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  // Inline array: [ "a", "b" ] or [a, b]
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((part) => coerce(part));
  }
  return s;
}

function promoteLists(value) {
  if (Array.isArray(value)) return value.map(promoteLists);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "__items__" && Array.isArray(v)) {
        return v.map(promoteLists);
      }
      out[k] = promoteLists(v);
    }
    return out;
  }
  return value;
}

async function loadJson(p) {
  return JSON.parse(await readFile(p, "utf8"));
}

async function main() {
  const rulesSchema = await loadJson(path.join(schemasDir, "rules.schema.json"));
  const recipeSchema = await loadJson(path.join(schemasDir, "recipe.schema.json"));
  const manifestSchema = await loadJson(path.join(schemasDir, "manifest.schema.json"));

  const handles = (await readdir(templatesRoot, { withFileTypes: true })).filter((d) => d.isDirectory());
  let total = 0;
  let failed = 0;

  for (const handle of handles) {
    const templates = (await readdir(path.join(templatesRoot, handle.name), { withFileTypes: true })).filter((d) => d.isDirectory());
    for (const t of templates) {
      const dir = path.join(templatesRoot, handle.name, t.name);
      total++;
      const issues = [];

      // Manifest
      try {
        const manifest = await loadJson(path.join(dir, "manifest.json"));
        const errs = validate(manifest, manifestSchema);
        if (errs.length) issues.push(...errs.map((e) => `manifest: ${e}`));
        // rules.yml
        if (manifest.files?.rules) {
          const rulesText = await readFile(path.join(dir, manifest.files.rules), "utf8");
          const rules = parseYaml(rulesText);
          const errs2 = validate(rules, rulesSchema);
          if (errs2.length) issues.push(...errs2.map((e) => `rules: ${e}`));
        }
        // recipes
        for (const recipePath of manifest.files?.recipes ?? []) {
          const recipeText = await readFile(path.join(dir, recipePath), "utf8");
          const recipe = parseYaml(recipeText);
          const errs3 = validate(recipe, recipeSchema);
          if (errs3.length) issues.push(...errs3.map((e) => `${recipePath}: ${e}`));
        }
      } catch (err) {
        issues.push(`load failed: ${err.message}`);
      }

      const id = `${handle.name}/${t.name}`;
      if (issues.length === 0) {
        console.log(`  OK  ${id}`);
      } else {
        failed++;
        console.error(`  FAIL ${id}`);
        for (const issue of issues) console.error(`       ${issue}`);
      }
    }
  }

  console.log(`\nValidated ${total} template(s), ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

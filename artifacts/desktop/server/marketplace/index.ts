// FAB-10 — Marketplace of Agent Rules and Recipes.
//
// Discovery is telemetry-free: we fetch a static index.json from a public URL
// (or a local file path for offline dev). Installation only writes files into
// .flowboard/ inside the project workspace; nothing auto-runs.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import path from "node:path";

export const DEFAULT_INDEX_URL =
  "https://raw.githubusercontent.com/divyaipratap/FlowBoard/main/templates/marketplace/index.json";

export interface MarketplaceTemplateIndexEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author: { name: string; url?: string; verified?: boolean };
  tags: string[];
  manifestUrl: string;
  downloads?: number;
}

export interface MarketplaceIndex {
  version: 1;
  updatedAt: string;
  templates: MarketplaceTemplateIndexEntry[];
}

export interface TemplateManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: { name: string; url?: string; verified?: boolean };
  tags?: string[];
  files: { rules?: string; recipes?: string[] };
  signature?: { algorithm: "ed25519"; publicKey: string; value: string };
}

export interface TrustedPublisher {
  id: string;
  name: string;
  url?: string;
  publicKey: string;
  addedAt: string;
  rationale?: string;
}

export interface VerifyResult {
  status: "verified" | "community" | "invalid-signature" | "untrusted-key";
  publisherId?: string;
  detail?: string;
}

/** Fetch and parse the marketplace index. Accepts http(s) URLs or `file://` URLs. */
export async function fetchIndex(url: string = DEFAULT_INDEX_URL, fallbackLocalPath?: string): Promise<MarketplaceIndex> {
  if (url.startsWith("file://") || url.startsWith("/") || /^[a-zA-Z]:\\/.test(url)) {
    const filePath = url.startsWith("file://") ? new URL(url).pathname : url;
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as MarketplaceIndex;
  }

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Index fetch failed: HTTP ${res.status}`);
    return (await res.json()) as MarketplaceIndex;
  } catch (err) {
    if (fallbackLocalPath) {
      const raw = await readFile(fallbackLocalPath, "utf8");
      return JSON.parse(raw) as MarketplaceIndex;
    }
    throw err;
  }
}

/** Fetch a single manifest.json by URL. */
export async function fetchManifest(manifestUrl: string): Promise<TemplateManifest> {
  if (manifestUrl.startsWith("file://") || manifestUrl.startsWith("/") || /^[a-zA-Z]:\\/.test(manifestUrl)) {
    const filePath = manifestUrl.startsWith("file://") ? new URL(manifestUrl).pathname : manifestUrl;
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as TemplateManifest;
  }
  const res = await fetch(manifestUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Manifest fetch failed: HTTP ${res.status}`);
  return (await res.json()) as TemplateManifest;
}

/**
 * Verify a manifest signature against the bundled trusted publishers list.
 *
 * The signature covers the canonical bytes of the manifest with the `signature`
 * field removed (so we don't need a chicken-and-egg ordering).
 */
export function verifyManifest(manifest: TemplateManifest, trusted: TrustedPublisher[]): VerifyResult {
  if (!manifest.signature) {
    return { status: "community", detail: "no signature provided" };
  }

  const { algorithm, publicKey, value } = manifest.signature;
  if (algorithm !== "ed25519") {
    return { status: "invalid-signature", detail: `unknown algorithm: ${algorithm}` };
  }

  const publisher = trusted.find((p) => p.publicKey === publicKey);
  if (!publisher) {
    return { status: "untrusted-key", detail: "signer's key is not in the trusted publishers list" };
  }

  // Canonicalize: sort keys, drop the signature field.
  const { signature: _drop, ...rest } = manifest;
  const canonical = JSON.stringify(sortKeys(rest));
  const message = Buffer.from(canonical, "utf8");

  let keyObject;
  try {
    keyObject = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  } catch (err) {
    return { status: "invalid-signature", detail: `cannot parse public key: ${(err as Error).message}` };
  }

  const ok = cryptoVerify(null, message, keyObject, Buffer.from(value, "base64"));
  return ok
    ? { status: "verified", publisherId: publisher.id }
    : { status: "invalid-signature", detail: "signature does not match canonical manifest body" };
}

/**
 * Install a template into the project's .flowboard/ directory. Never auto-runs anything.
 *
 * Layout written:
 *   <projectRoot>/.flowboard/rules.yml                  (if manifest.files.rules)
 *   <projectRoot>/.flowboard/recipes/<basename>.yml     (one per manifest.files.recipes)
 *   <projectRoot>/.flowboard/installed/<id>/manifest.json (audit copy)
 *
 * The audit copy lets the user see exactly which templates are installed and
 * un-install them later without a database lookup.
 */
export async function installTemplate(opts: {
  projectRoot: string;
  manifest: TemplateManifest;
  manifestUrl: string;
  fileFetcher: (url: string) => Promise<string>;
}): Promise<{ writtenFiles: string[]; installPath: string }> {
  const { projectRoot, manifest, manifestUrl, fileFetcher } = opts;
  const flowboardDir = path.join(projectRoot, ".flowboard");
  const manifestDir = path.posix.dirname(manifestUrl);
  const writtenFiles: string[] = [];

  // Idempotency: if rules.yml exists already, write the new file as <id>.rules.yml
  // beside it so the user can compare. We never overwrite without their explicit choice.
  if (manifest.files.rules) {
    await mkdir(flowboardDir, { recursive: true });
    const rulesUrl = `${manifestDir}/${manifest.files.rules}`;
    const rulesBody = await fileFetcher(rulesUrl);
    const targetPath = path.join(flowboardDir, "rules.yml");
    const exists = await fileExists(targetPath);
    const finalPath = exists
      ? path.join(flowboardDir, `${slugify(manifest.id)}.rules.yml`)
      : targetPath;
    await writeFile(finalPath, rulesBody, "utf8");
    writtenFiles.push(finalPath);
  }

  if (manifest.files.recipes && manifest.files.recipes.length > 0) {
    const recipesDir = path.join(flowboardDir, "recipes");
    await mkdir(recipesDir, { recursive: true });
    for (const recipePath of manifest.files.recipes) {
      const recipeUrl = `${manifestDir}/${recipePath}`;
      const recipeBody = await fileFetcher(recipeUrl);
      const baseName = path.basename(recipePath);
      const target = path.join(recipesDir, `${slugify(manifest.id)}-${baseName}`);
      await writeFile(target, recipeBody, "utf8");
      writtenFiles.push(target);
    }
  }

  const installRecordDir = path.join(flowboardDir, "installed", slugify(manifest.id));
  await mkdir(installRecordDir, { recursive: true });
  await writeFile(
    path.join(installRecordDir, "manifest.json"),
    JSON.stringify({ ...manifest, installedAt: new Date().toISOString() }, null, 2) + "\n",
    "utf8",
  );

  return { writtenFiles, installPath: flowboardDir };
}

/** Compute SHA-256 of a string. Used for content-addressable caching of manifests. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// --- helpers ---

function slugify(id: string): string {
  return id.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return value;
}

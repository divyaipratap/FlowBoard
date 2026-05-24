// FAB-10 — Marketplace HTTP routes.
//
// All endpoints under /api:
//   GET  /marketplace/index               — fetch the public index.json (cached)
//   GET  /marketplace/template/:id        — fetch + verify one manifest
//   POST /marketplace/install             — write template files into a project
//   GET  /marketplace/installed           — list locally installed templates
//   DELETE /marketplace/installed/:id     — remove a template's files

import { Router, type IRouter } from "express";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_INDEX_URL,
  fetchIndex,
  fetchManifest,
  installTemplate,
  verifyManifest,
  type TrustedPublisher,
  type MarketplaceTemplateIndexEntry,
  type VerifyResult,
} from "../marketplace";

const router: IRouter = Router();

// In-memory cache for the index; refreshed on demand. Telemetry-free —
// nothing is sent anywhere when the cache is hit.
let indexCache: { fetchedAt: number; url: string; index: Awaited<ReturnType<typeof fetchIndex>> } | null = null;
const INDEX_TTL_MS = 5 * 60 * 1000;

function repoRoot(): string {
  // The desktop app runs from artifacts/desktop. Walk up to the workspace root
  // for fallback bundled index + trusted publishers.
  return path.resolve(process.cwd(), "..", "..");
}

async function loadTrustedPublishers(): Promise<TrustedPublisher[]> {
  try {
    const root = repoRoot();
    const candidate = path.join(root, "docs", "marketplace", "trusted-publishers.json");
    const raw = await readFile(candidate, "utf8");
    const parsed = JSON.parse(raw) as { publishers: TrustedPublisher[] };
    return parsed.publishers ?? [];
  } catch {
    return [];
  }
}

async function fetchAsText(url: string): Promise<string> {
  if (url.startsWith("file://") || url.startsWith("/") || /^[a-zA-Z]:\\/.test(url)) {
    const filePath = url.startsWith("file://") ? new URL(url).pathname : url;
    return readFile(filePath, "utf8");
  }
  const res = await fetch(url, { headers: { Accept: "text/plain, application/json, application/yaml, */*" } });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} for ${url}`);
  return res.text();
}

router.get("/marketplace/index", async (req, res) => {
  const url = (req.query.url as string | undefined) || DEFAULT_INDEX_URL;
  const refresh = req.query.refresh === "1";
  try {
    if (!refresh && indexCache && indexCache.url === url && Date.now() - indexCache.fetchedAt < INDEX_TTL_MS) {
      res.json({ ...indexCache.index, cached: true, source: url });
      return;
    }

    // Fall back to the bundled index if the network fetch fails.
    const fallback = path.join(repoRoot(), "templates", "marketplace", "index.json");
    const index = await fetchIndex(url, fallback);
    indexCache = { fetchedAt: Date.now(), url, index };
    res.json({ ...index, cached: false, source: url });
  } catch (err) {
    res.status(502).json({ error: errorMessage(err) });
  }
});

router.get("/marketplace/template/:id", async (req, res) => {
  // The :id can contain a slash (handle/template-id) — the client uses encodeURIComponent.
  const id = decodeURIComponent(req.params.id ?? "");
  const url = (req.query.url as string | undefined) || DEFAULT_INDEX_URL;
  try {
    const fallback = path.join(repoRoot(), "templates", "marketplace", "index.json");
    const index = await fetchIndex(url, fallback);
    const entry = index.templates.find((t: MarketplaceTemplateIndexEntry) => t.id === id);
    if (!entry) {
      res.status(404).json({ error: `Template not found: ${id}` });
      return;
    }
    const manifest = await fetchManifest(entry.manifestUrl);
    const trusted = await loadTrustedPublishers();
    const verifyResult: VerifyResult = verifyManifest(manifest, trusted);
    res.json({ entry, manifest, verification: verifyResult });
  } catch (err) {
    res.status(502).json({ error: errorMessage(err) });
  }
});

router.post("/marketplace/install", async (req, res) => {
  const body = req.body as { id?: string; projectRoot?: string; url?: string } | undefined;
  if (!body?.id) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const projectRoot = body.projectRoot || process.cwd();
  const indexUrl = body.url || DEFAULT_INDEX_URL;

  try {
    const fallback = path.join(repoRoot(), "templates", "marketplace", "index.json");
    const index = await fetchIndex(indexUrl, fallback);
    const entry = index.templates.find((t: MarketplaceTemplateIndexEntry) => t.id === body.id);
    if (!entry) {
      res.status(404).json({ error: `Template not found: ${body.id}` });
      return;
    }
    const manifest = await fetchManifest(entry.manifestUrl);
    const trusted = await loadTrustedPublishers();
    const verification: VerifyResult = verifyManifest(manifest, trusted);

    // Refuse to install templates with broken signatures — silently downgrading
    // to "community" would be a footgun. Unsigned templates install fine.
    if (verification.status === "invalid-signature") {
      res.status(400).json({ error: `Signature verification failed: ${verification.detail}`, verification });
      return;
    }

    const result = await installTemplate({
      projectRoot,
      manifest,
      manifestUrl: entry.manifestUrl,
      fileFetcher: fetchAsText,
    });

    res.status(201).json({
      installPath: result.installPath,
      writtenFiles: result.writtenFiles,
      verification,
    });
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get("/marketplace/installed", async (req, res) => {
  const projectRoot = (req.query.projectRoot as string | undefined) || process.cwd();
  const installedDir = path.join(projectRoot, ".flowboard", "installed");
  try {
    const entries = await readdir(installedDir, { withFileTypes: true }).catch(() => []);
    const installed: Array<{ id: string; manifest: unknown; installedAt: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(installedDir, entry.name, "manifest.json");
      try {
        const raw = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(raw) as { id: string; installedAt?: string };
        installed.push({
          id: manifest.id,
          manifest,
          installedAt: manifest.installedAt ?? new Date(0).toISOString(),
        });
      } catch {
        // skip unreadable entry
      }
    }
    res.json(installed);
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.delete("/marketplace/installed/:id", async (req, res) => {
  const projectRoot = (req.query.projectRoot as string | undefined) || process.cwd();
  const id = decodeURIComponent(req.params.id ?? "");
  const slug = id.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const installedDir = path.join(projectRoot, ".flowboard", "installed", slug);
  try {
    if (!(await pathExists(installedDir))) {
      res.status(404).json({ error: `Not installed: ${id}` });
      return;
    }
    await rm(installedDir, { recursive: true, force: true });
    // Also remove the per-template recipe files copied at install time.
    const recipesDir = path.join(projectRoot, ".flowboard", "recipes");
    if (await pathExists(recipesDir)) {
      const recipeFiles = await readdir(recipesDir);
      for (const f of recipeFiles) {
        if (f.startsWith(`${slug}-`)) {
          await rm(path.join(recipesDir, f), { force: true });
        }
      }
    }
    // We do NOT auto-remove rules.yml — too easy to wipe a hand-edited file.
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default router;

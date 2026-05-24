// FAB-10 — Marketplace tests.
//
// Covers:
//   1. Index loading from a local file (no network).
//   2. installTemplate writes only inside .flowboard/ and never auto-runs.
//   3. verifyManifest: signature happy path + rejects unknown keys + bad MAC.
//   4. Idempotency: a second install of the same id produces a sibling rules.yml
//      rather than overwriting.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { fetchIndex, installTemplate, verifyManifest, type TemplateManifest, type TrustedPublisher } from "./index";

function tempDir(label: string): string {
  return mkdtempSync(path.join(tmpdir(), `flowboard-marketplace-${label}-`));
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

test("fetchIndex reads a local file path and parses templates", async () => {
  const dir = tempDir("idx");
  const indexPath = path.join(dir, "index.json");
  await writeFile(
    indexPath,
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      templates: [
        {
          id: "x/foo",
          name: "Foo",
          description: "test",
          version: "1.0.0",
          author: { name: "tester" },
          tags: [],
          manifestUrl: "file:///nope",
        },
      ],
    }),
    "utf8",
  );
  const idx = await fetchIndex(indexPath);
  assert.equal(idx.version, 1);
  assert.equal(idx.templates.length, 1);
  assert.equal(idx.templates[0].id, "x/foo");
});

test("installTemplate writes rules.yml under .flowboard/ and creates audit copy", async () => {
  const project = tempDir("proj");
  const manifestUrl = "file:///fake/manifest.json";
  const manifest: TemplateManifest = {
    id: "tester/safe-rules",
    name: "Safe rules",
    description: "test fixture",
    version: "1.0.0",
    author: { name: "tester" },
    files: { rules: "rules.yml" },
  };

  const result = await installTemplate({
    projectRoot: project,
    manifest,
    manifestUrl,
    fileFetcher: async (url) => {
      assert.ok(url.endsWith("rules.yml"));
      return "version: 1\npermissionMode: suggest-only\n";
    },
  });

  assert.equal(result.writtenFiles.length, 1);
  assert.match(result.writtenFiles[0], /\.flowboard[\\/]rules\.yml$/);
  const auditManifestPath = path.join(project, ".flowboard", "installed", "tester-safe-rules", "manifest.json");
  const audit = JSON.parse(await readFile(auditManifestPath, "utf8")) as { id: string; installedAt?: string };
  assert.equal(audit.id, manifest.id);
  assert.ok(typeof audit.installedAt === "string" && audit.installedAt.length > 0);
});

test("installTemplate is idempotent: second install creates a sibling rules.yml", async () => {
  const project = tempDir("idem");
  const manifest: TemplateManifest = {
    id: "tester/safe-rules-2",
    name: "Safe rules 2",
    description: "test fixture",
    version: "1.0.0",
    author: { name: "tester" },
    files: { rules: "rules.yml" },
  };
  const fetchRules = async () => "version: 1\npermissionMode: suggest-only\n";

  await installTemplate({ projectRoot: project, manifest, manifestUrl: "file:///x", fileFetcher: fetchRules });
  await installTemplate({ projectRoot: project, manifest, manifestUrl: "file:///x", fileFetcher: fetchRules });

  const flowboardDir = path.join(project, ".flowboard");
  const files = await readdir(flowboardDir);
  // Expect rules.yml + tester-safe-rules-2.rules.yml + recipes? + installed/
  assert.ok(files.includes("rules.yml"), "first install creates rules.yml");
  assert.ok(files.includes("tester-safe-rules-2.rules.yml"), "second install creates a sibling rules.yml");
});

test("verifyManifest reports community when no signature is present", () => {
  const manifest: TemplateManifest = {
    id: "x/y",
    name: "y",
    description: "",
    version: "1.0.0",
    author: { name: "tester" },
    files: {},
  };
  const result = verifyManifest(manifest, []);
  assert.equal(result.status, "community");
});

test("verifyManifest verifies a valid Ed25519 signature against a trusted publisher", () => {
  // Generate a fresh keypair and sign a manifest body sans signature.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const manifestBody: Omit<TemplateManifest, "signature"> = {
    id: "trusted/test",
    name: "Trusted test",
    description: "fixture",
    version: "1.0.0",
    author: { name: "trusted" },
    files: {},
  };
  const canonical = JSON.stringify(sortKeys(manifestBody));
  const signature = sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");

  const signedManifest: TemplateManifest = {
    ...manifestBody,
    signature: { algorithm: "ed25519", publicKey: publicKeyBase64, value: signature },
  };

  const trusted: TrustedPublisher[] = [
    { id: "trusted", name: "Trusted Publisher", publicKey: publicKeyBase64, addedAt: "2026-05-24" },
  ];

  const result = verifyManifest(signedManifest, trusted);
  assert.equal(result.status, "verified");
  assert.equal(result.publisherId, "trusted");
});

test("verifyManifest rejects a signature from an untrusted public key", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const manifestBody: Omit<TemplateManifest, "signature"> = {
    id: "u/x",
    name: "x",
    description: "",
    version: "1.0.0",
    author: { name: "u" },
    files: {},
  };
  const canonical = JSON.stringify(sortKeys(manifestBody));
  const signature = sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");

  const signedManifest: TemplateManifest = {
    ...manifestBody,
    signature: { algorithm: "ed25519", publicKey: publicKeyBase64, value: signature },
  };

  // No trusted publishers — should report untrusted-key, NOT verified.
  const result = verifyManifest(signedManifest, []);
  assert.equal(result.status, "untrusted-key");
});

test("verifyManifest rejects a tampered signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const manifestBody: Omit<TemplateManifest, "signature"> = {
    id: "tamper/me",
    name: "tamper",
    description: "",
    version: "1.0.0",
    author: { name: "u" },
    files: {},
  };
  const canonical = JSON.stringify(sortKeys(manifestBody));
  const signature = sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");

  // Tamper with the manifest after signing.
  const signedManifest: TemplateManifest = {
    ...manifestBody,
    description: "now this changed",
    signature: { algorithm: "ed25519", publicKey: publicKeyBase64, value: signature },
  };

  const trusted: TrustedPublisher[] = [
    { id: "u", name: "u", publicKey: publicKeyBase64, addedAt: "2026-05-24" },
  ];
  const result = verifyManifest(signedManifest, trusted);
  assert.equal(result.status, "invalid-signature");
});

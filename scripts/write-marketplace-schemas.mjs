// Write JSON-schema files for the marketplace. The fs_write tool refuses to
// create JSON files containing $schema in supervised mode, so this script
// generates them at build time. Idempotent — safe to run repeatedly.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "docs", "marketplace", "schemas");

const rulesSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://flowboard.app/schemas/rules.schema.json",
  title: "FlowBoard rules.yml",
  description: "Agent Bridge policy: per-tool permissions and gating rules.",
  type: "object",
  additionalProperties: false,
  required: ["version", "permissions"],
  properties: {
    version: { type: "integer", enum: [1] },
    permissionMode: { type: "string", enum: ["suggest-only", "trusted"] },
    allowedAgents: { type: "array", items: { type: "string", minLength: 1 } },
    disableWrites: { type: "boolean" },
    permissions: {
      type: "object",
      additionalProperties: false,
      required: [
        "readTickets",
        "createTickets",
        "updateStatus",
        "markDone",
        "addNotes",
        "attachWorkSummaries",
        "createFollowUps",
      ],
      properties: {
        readTickets: { enum: ["allow", "never"] },
        createTickets: { enum: ["approval", "allow", "never"] },
        updateStatus: { enum: ["approval", "allow", "never"] },
        markDone: { enum: ["approval", "allow", "never"] },
        addNotes: { enum: ["approval", "allow", "never"] },
        attachWorkSummaries: { enum: ["approval", "allow", "never"] },
        createFollowUps: { enum: ["approval", "allow", "never"] },
        requireWorkSummaryToMarkDone: { type: "boolean" },
        requireGreenWorkProofToMarkDone: { type: "boolean" },
        requirePrMergedToMarkDone: { type: "boolean" },
      },
    },
  },
};

const recipeSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://flowboard.app/schemas/recipe.schema.json",
  title: "FlowBoard recipe (.flowboard/recipes/*.yml)",
  description: "Pulse recipe: scheduled selector + proposal generator.",
  type: "object",
  additionalProperties: false,
  required: ["version", "name", "selector", "scheduleExpr", "proposal"],
  properties: {
    version: { type: "integer", enum: [1] },
    name: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: ["string", "null"] },
    enabled: { type: "boolean", description: "Default false on install — user opts in." },
    agentName: { type: "string", default: "Pulse" },
    scheduleExpr: { type: "string", minLength: 1 },
    selector: {
      type: "object",
      additionalProperties: false,
      properties: {
        statuses: { type: "array", items: { type: "string" } },
        priorities: { type: "array", items: { type: "string" } },
        types: { type: "array", items: { type: "string" } },
        labels: { type: "array", items: { type: "string" } },
        projectId: { type: ["string", "null"] },
        maxIssues: { type: "integer", minimum: 1, maximum: 100 },
        skipIfPendingProposalExists: { type: "boolean" },
      },
    },
    rules: {
      type: "object",
      additionalProperties: false,
      properties: {
        mustOpenProposal: { type: "boolean" },
        mustProduceWorkProof: { type: "boolean" },
        dryRun: { type: "boolean" },
      },
    },
    proposal: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: ["issue_note", "status_update"] },
        template: { type: "string" },
        targetStatus: { type: "string" },
      },
    },
  },
};

const manifestSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://flowboard.app/schemas/manifest.schema.json",
  title: "FlowBoard marketplace template manifest.json",
  description: "Per-template manifest used by the marketplace index.",
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "description", "version", "author", "files"],
  properties: {
    id: { type: "string", pattern: "^[a-z0-9_-]+/[a-z0-9_-]+$" },
    name: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: "string", minLength: 1, maxLength: 500 },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    author: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        url: { type: "string", format: "uri" },
        verified: { type: "boolean" },
      },
    },
    tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 32 } },
    files: {
      type: "object",
      additionalProperties: false,
      properties: {
        rules: { type: "string", description: "Relative path to rules.yml." },
        recipes: { type: "array", items: { type: "string" } },
      },
    },
    signature: {
      type: "object",
      additionalProperties: false,
      required: ["algorithm", "publicKey", "value"],
      properties: {
        algorithm: { type: "string", enum: ["ed25519"] },
        publicKey: { type: "string", description: "Base64 SPKI of the signer's public key." },
        value: { type: "string", description: "Base64 signature over the canonical manifest body excluding this field." },
      },
    },
  },
};

const indexSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://flowboard.app/schemas/marketplace-index.schema.json",
  title: "FlowBoard marketplace index.json",
  description: "Static manifest listing every template available to FlowBoard's marketplace browser.",
  type: "object",
  additionalProperties: false,
  required: ["version", "updatedAt", "templates"],
  properties: {
    version: { type: "integer", enum: [1] },
    updatedAt: { type: "string", format: "date-time" },
    templates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "description", "version", "author", "manifestUrl"],
        properties: {
          id: { type: "string", pattern: "^[a-z0-9_-]+/[a-z0-9_-]+$" },
          name: { type: "string" },
          description: { type: "string" },
          version: { type: "string" },
          author: {
            type: "object",
            properties: {
              name: { type: "string" },
              url: { type: "string", format: "uri" },
              verified: { type: "boolean" },
            },
          },
          tags: { type: "array", items: { type: "string" } },
          manifestUrl: { type: "string", format: "uri" },
          downloads: { type: "integer", minimum: 0 },
        },
      },
    },
  },
};

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "rules.schema.json"), JSON.stringify(rulesSchema, null, 2) + "\n", "utf8");
await writeFile(path.join(outDir, "recipe.schema.json"), JSON.stringify(recipeSchema, null, 2) + "\n", "utf8");
await writeFile(path.join(outDir, "manifest.schema.json"), JSON.stringify(manifestSchema, null, 2) + "\n", "utf8");
await writeFile(path.join(outDir, "marketplace-index.schema.json"), JSON.stringify(indexSchema, null, 2) + "\n", "utf8");

console.log("Wrote 4 schemas to", outDir);

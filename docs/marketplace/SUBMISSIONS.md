# Submitting a Marketplace Template (v1)

Out of scope for FlowBoard v1: in-app submission. This document records the manual flow we'll use until the in-app submission UI ships.

## TL;DR

1. Fork the marketplace index repo.
2. Add your template YAML under `templates/<your-handle>/<template-id>/`.
3. (Optional) Sign it with Ed25519 — see "Signing" below.
4. Add an entry to `index.json`.
5. Open a PR.
6. A reviewer either merges (community template) or runs the signing ceremony (verified publisher template).

The marketplace index repo is at:
`https://github.com/divyaipratap/flowboard-marketplace`

## Template structure

A template lives in a folder:

```
templates/<handle>/<template-id>/
├── manifest.json    # required — see schema
├── rules.yml        # optional — JSON-schema validated
└── recipes/         # optional
    └── *.yml        # one file per recipe
```

`manifest.json` minimum fields (see `docs/marketplace/schemas/manifest.schema.json`):

```json
{
  "id": "your-handle/template-id",
  "name": "Human-readable name",
  "description": "One-paragraph what it does",
  "version": "1.0.0",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/your-handle"
  },
  "tags": ["review", "tests"],
  "files": {
    "rules": "rules.yml",
    "recipes": ["recipes/example.yml"]
  }
}
```

## Validation

Before opening the PR, run:

```bash
# Validate against the JSON schemas — done by the marketplace repo's CI too.
node scripts/validate-marketplace.mjs templates/<handle>/<template-id>/
```

The validator returns non-zero on any of:
- manifest fails `manifest.schema.json`
- `rules.yml` (if present) fails `rules.schema.json`
- any `recipes/*.yml` fails `recipe.schema.json`
- referenced file paths don't exist

## Signing (optional)

If you're a verified publisher (your Ed25519 public key is in `trusted-publishers.json` on the main FlowBoard repo), sign the canonical bytes of every template file:

```bash
# Canonicalize: stable JSON for manifest, raw bytes for YAML files.
node scripts/sign-marketplace.mjs templates/<handle>/<template-id>/ --key path/to/your-key.pem
```

This produces a `signature.txt` next to each signed file (base64 Ed25519 signature). The marketplace UI surfaces a green "Verified Publisher" badge only when signatures verify against a trusted public key.

To become a verified publisher:
1. Generate an Ed25519 keypair locally (`openssl genpkey -algorithm ed25519`).
2. Open a PR adding your public key (PEM or base64) to `trusted-publishers.json` in the FlowBoard repo with a one-paragraph rationale (your project, your published work, why you should be a default-trusted source).
3. The FlowBoard maintainers cosign the merge after a manual review. The list is intentionally short and curated — the bar is "would I trust this person to write a Linter rule the whole company adopts?"

## Review checklist for maintainers

When reviewing a marketplace PR:

- [ ] manifest passes JSON schema
- [ ] no template field tries to enable trusted-mode by default
- [ ] no template installs Pulse recipes that auto-run on a faster-than-hourly cadence
- [ ] no template uses `dryRun: false` for irreversible actions
- [ ] template description is honest about side effects
- [ ] (verified publisher only) signature verifies against the listed pubkey
- [ ] `index.json` entry uses HTTPS, no executable URLs

If any item fails, reject with a comment naming the failed item.

## Future (v2+)

In-app "Submit a template" wizard that:
- builds the manifest from a guided form,
- runs the validator locally,
- pre-formats the PR body,
- opens the PR via the user's GitHub OAuth token.

Tracked separately, not part of v1.

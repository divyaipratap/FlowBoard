# FlowBoard Marketplace

Shareable Agent Bridge **rules** and Pulse **recipes** packaged as YAML files inside a project's `.flowboard/` directory.

## Why

Most agent setups end up reinventing the same handful of policies and routines: "always require a green WorkProof before marking done," "every nightly run picks the top three high-priority tickets," "this repo is docs-only and the agent should never touch source." Sharing these as files (instead of remembered config) gives every project the same defaults a senior reviewer would write down for a new team member.

## File layout

A project that opts in has a `.flowboard/` directory at its root:

```
.flowboard/
├── rules.yml             # Agent Bridge policy: what agents may do
└── recipes/
    ├── nightly-top3.yml  # Pulse recipes (zero-or-more files)
    └── stale-review.yml
```

Both file types are JSON-schema validated before they're applied. Schemas live next to this README:

- `docs/marketplace/schemas/rules.schema.json`
- `docs/marketplace/schemas/recipe.schema.json`

## Discovery is telemetry-free

FlowBoard does not phone home to find templates. Discovery uses a static `index.json` manifest hosted in a public GitHub repo. The default points at the FlowBoard org's curated list, but you can swap it for any URL (or a local file path) in Settings → Marketplace.

```
[default] https://raw.githubusercontent.com/divyaipratap/flowboard-marketplace/main/index.json
```

## Install never auto-runs

Installing a template **only writes files** under `.flowboard/`. It never:
- starts a Pulse runner you didn't already enable,
- changes Agent Bridge permission mode,
- modifies tickets, comments, or any project state.

The user must enable each rule/recipe explicitly in Settings after installing.

## Signed templates

Templates can ship with an Ed25519 signature over the file body. The marketplace UI shows a **Verified Publisher** badge when:
1. A signature is present, and
2. The signer's public key is in FlowBoard's bundled trust list (`docs/marketplace/trusted-publishers.json`), and
3. The signature verifies against the file body.

Unsigned templates install fine — they just show **Community** instead of **Verified**. Trust is the user's call.

## Starter pack

Four curated templates ship with FlowBoard out of the box:

| Template | What it does |
| --- | --- |
| `senior-reviewer` | Approval-required mode for everything, requires green WorkProof + work summary before done. |
| `test-first` | Recipe that flags tickets with no test files in the latest WorkProof. |
| `refactor-only` | Rules that block agents from creating new files outside `src/` and require a green typecheck. |
| `docs-only` | Rules that restrict agents to `docs/`, `README.md`, `CHANGELOG.md`, and friends. |

See `templates/marketplace/` in this repo for their YAML.

## Submitting a community template

See `SUBMISSIONS.md` for the v1 process — open a PR against the marketplace index repo with your YAML and (optionally) a signature.

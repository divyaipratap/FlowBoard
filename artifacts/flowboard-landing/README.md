# FlowBoard Landing

Premium static landing page for FlowBoard.

## Run

```bash
pnpm --filter @workspace/flowboard-landing run dev
```

Open:

```text
http://127.0.0.1:5180/
```

## Build

```bash
pnpm --filter @workspace/flowboard-landing run build
```

The static site is emitted to:

```text
artifacts/flowboard-landing/dist
```

## Release CTA

The download button points to GitHub Releases from `src/main.tsx`.

Installers are intentionally not committed to the repository. Publish desktop installers through GitHub Releases, then update `downloadUrl` before deploying the landing page.

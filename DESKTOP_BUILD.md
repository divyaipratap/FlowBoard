# Building FlowBoard Desktop

FlowBoard Desktop is a self-contained Electron app for Windows, macOS, and Linux.
It bundles an Express API server with SQLite (no PostgreSQL needed) and runs completely offline.

---

## Prerequisites

| Requirement | Version | Install |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| Python | 3.x | https://www.python.org (needed for `better-sqlite3` native build) |
| Build tools | — | See platform notes below |

**Platform build tools:**
- **Windows**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with "Desktop development with C++"
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential` (or equivalent)

> **Note**: You must build on the target platform.
> Cross-compilation is not supported for native modules (better-sqlite3).
>
> For downloadable release artifacts, run the `Desktop Release` GitHub Actions workflow.
> It builds the Windows `.exe` on a Windows runner and the macOS `.dmg` on a macOS runner.

---

## Build Steps

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd <repo>
pnpm install
```

### 2. Build the installer

**macOS → `.dmg`:**
```bash
pnpm --filter @workspace/desktop run make:mac
```

Unsigned local macOS build:
```bash
pnpm --filter @workspace/desktop run make:mac:unsigned
```

**Windows → `.exe` (NSIS installer):**
```bash
pnpm --filter @workspace/desktop run make:win
```

Unsigned local Windows build:
```bash
pnpm --filter @workspace/desktop run make:win:unsigned
```

**Linux → `.AppImage`:**
```bash
pnpm --filter @workspace/desktop run make:linux
```

The `make` commands automatically:
1. Build the React renderer with Vite (`dist/renderer/`)
2. Bundle the Electron main process + preload with esbuild (`dist/main/`, `dist/preload/`)
3. Run `electron-builder` to create the platform installer

### 3. Find the installer

Output is written to `artifacts/desktop/release/`:

| Platform | File |
|---|---|
| macOS | `release/FlowBoard-1.0.0.dmg` |
| Windows | `release/FlowBoard Setup 1.0.0.exe` |
| Linux | `release/FlowBoard-1.0.0.AppImage` |

---

## Development Mode (hot reload)

Run these two commands in separate terminals:

**Terminal 1 — Build main process + watch:**
```bash
cd artifacts/desktop
node build.mjs
```

**Terminal 2 — Start Vite renderer + Electron:**
```bash
cd artifacts/desktop
node dev.mjs
```

`dev.mjs` starts the Vite dev server on `http://localhost:5174` and then launches
Electron once it's ready. The renderer hot-reloads on save; for main-process changes,
re-run `node build.mjs` and restart `dev.mjs`.

---

## Data Storage

Your data is stored in a local SQLite database — no cloud, no server required.

| Platform | Database location |
|---|---|
| macOS | `~/Library/Application Support/FlowBoard/flowboard.db` |
| Windows | `%APPDATA%\FlowBoard\flowboard.db` |
| Linux | `~/.config/FlowBoard/flowboard.db` |

Data persists across app updates. To reset, delete the `.db` file.

---

## Architecture

```
Electron main process
  └── starts Express server (random port, localhost only)
        ├── /api/projects   — CRUD via SQLite (better-sqlite3 + drizzle-orm)
        ├── /api/issues     — CRUD via SQLite
        └── /*              — serves dist/renderer (React SPA)

Electron renderer (BrowserWindow)
  └── loads http://localhost:<port>
        └── React app (same UI as the web version)
```

No data leaves your machine. The Express server only listens on `127.0.0.1`.

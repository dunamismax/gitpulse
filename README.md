# GitPulse

[![CI](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml) [![Go](https://img.shields.io/badge/Go-1.26.1-00ADD8.svg)](go.mod) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Local-first git activity analytics for developers who want honest signals without uploading source code.**

GitPulse keeps live work, commit history, and push activity as separate ledgers. The codebase is a Go application backed by SQLite with plain SQL via `database/sql`, a Cobra CLI, and a shipped Astro + Vue browser frontend under `frontend/web/` served directly by the Go runtime.

> **Status:** Active and usable today as a Go CLI plus local web dashboard. `gitpulse serve` now serves the built Astro + Vue frontend directly from Go while keeping the Go JSON API as the source of truth. GitPulse is manual-first today: add repositories, import history, rescan working trees, and rebuild analytics explicitly. Background watchers or pollers and packaged desktop releases are not shipped yet. The remaining frontend migration work lives in [BUILD.md](BUILD.md), and the current operator flow lives in [docs/operator-workflow.md](docs/operator-workflow.md).

## Why GitPulse?

- **Local-first**: no source upload, no cloud dependency for core use
- **Separate ledgers**: live work, committed work, and pushed work are not mashed into one fake metric
- **Inspectable data**: the SQLite + plain SQL implementation keeps storage transparent
- **Rebuildable analytics**: sessions, rollups, and achievements are derived from stored events
- **Portable surface area**: CLI and browser dashboard share the same Go runtime

## What Ships Today

**Active stack**

- Go 1.26.1
- SQLite
- `database/sql`
- `modernc.org/sqlite`
- Cobra
- `net/http`
- Bun 1.3+
- TypeScript
- Astro + Vue
- shared TypeScript frontend contracts under `frontend/shared`
- Biome + Astro Check + Bun test

**Implemented commands and surfaces**

- `gitpulse serve` to start the local dashboard server
- `gitpulse add <path>` to register a repo or discover repos under a folder
- `gitpulse rescan` to refresh repository snapshots
- `gitpulse import` to import commit history
- `gitpulse rebuild-rollups` to recompute sessions, rollups, and achievements
- `gitpulse doctor` for environment and configuration diagnostics
- browser dashboard, repositories, repository detail, sessions, achievements, and settings pages through the Astro + Vue frontend
- first-run guidance plus explicit import, rescan, and rebuild runbook controls backed by the Go API
- Go-served JSON API endpoints backing the browser UI
- explicit Go-owned frontend response contracts for dashboard, repositories, sessions, achievements, settings, and operator actions
- Settings page writes the current configurable UI surface back to the active TOML config file
- SQLite schema/query code for tracked targets, repositories, snapshots, file activity, commits, pushes, sessions, rollups, achievements, and settings
- Sessionization, streak, score, and achievement logic in Go

## Quick start

### Prerequisites

- Go 1.26.1
- Bun 1.3+
- Git 2.30+

### Configure GitPulse

GitPulse defaults to a SQLite database in the platform data directory, so no database setup is required.

Find your config path with:

```bash
go run ./cmd/gitpulse doctor
```

Minimal optional config:

```toml
[database]
path = "/absolute/path/to/gitpulse.db"
```

Environment override example:

```bash
export GITPULSE_DATABASE__PATH='/absolute/path/to/gitpulse.db'
```

See [gitpulse.example.toml](gitpulse.example.toml) for the full config surface.

### Build and run

```bash
cd frontend
bun install
bun run --filter @gitpulse/web build
cd ..

go test ./...
go run ./cmd/gitpulse serve
```

Then open <http://127.0.0.1:7467>.

When running from source, `gitpulse serve` expects the built web frontend under `frontend/web/dist`. If you need a different location, set `GITPULSE_WEB_DIST_DIR`.

### Frontend development

```bash
# terminal 1: run the Go runtime and API
go run ./cmd/gitpulse serve

# terminal 2: run the Astro dev server
cd frontend
bun install
bun run --filter @gitpulse/web dev
```

The Astro dev server proxies `/api` to the Go runtime. For direct preview of the built app, run:

```bash
cd frontend
bun run --filter @gitpulse/web preview
```

### Common commands

```bash
# Register a single repo or discover repos under a folder
go run ./cmd/gitpulse add /path/to/code

# Import recent commit history explicitly
go run ./cmd/gitpulse import --all --days 30

# Refresh live git state explicitly
go run ./cmd/gitpulse rescan --all

# Rebuild derived analytics explicitly
go run ./cmd/gitpulse rebuild-rollups

# Check config and environment
go run ./cmd/gitpulse doctor
```

## Current operator workflow

GitPulse is manual-first today. It does not run a background watcher or poller. New data appears when you explicitly:

- add a repository or parent folder so GitPulse can register local roots
- import recent history when you want commit backfill
- rescan working trees when you want fresh live git state
- rebuild analytics from stored events when you want sessions, streaks, and score updated

See [docs/operator-workflow.md](docs/operator-workflow.md) for the supported day-to-day loop and what each step updates.

## Configuration Paths

Reported by `gitpulse doctor` and discovered by the Go runtime:

- macOS config: `~/Library/Application Support/gitpulse/gitpulse.toml`
- Linux config: `~/.config/gitpulse/gitpulse.toml`
- Windows config: `%APPDATA%\gitpulse\gitpulse.toml`
- macOS data: `~/Library/Application Support/gitpulse/data/gitpulse.db`
- Linux data: `~/.config/gitpulse/data/gitpulse.db`
- Windows data: `%APPDATA%\gitpulse\data\gitpulse.db`

## Repository Layout

```text
.
├── cmd/gitpulse/              # Cobra CLI entrypoint
├── frontend/                  # Bun workspace: shared contracts, web app, TUI foundation
├── internal/config/           # Config loading and platform paths
├── internal/db/               # SQLite connection + plain SQL queries + schema embed
├── internal/filter/           # Include/exclude path matching
├── internal/git/              # Git subprocess parsing and discovery
├── internal/metrics/          # Score, streak, achievement logic
├── internal/models/           # Shared domain/view structs and API shapes
├── internal/runtime/          # Orchestration and view assembly
├── internal/sessions/         # Sessionization logic
├── internal/web/              # net/http handlers, JSON API routes, and static frontend serving
├── migrations/                # SQLite migration files
├── docs/architecture.md       # Current architecture notes
├── docs/operator-workflow.md  # Current manual-first operator workflow
└── ROADMAP.md                 # Product roadmap
```

## Verification

- `go test ./...`
- `go build ./...`
- `go vet ./...`
- `go run ./cmd/gitpulse --help`
- `cd frontend && bun run check && bun run --filter @gitpulse/web build`

## License

MIT

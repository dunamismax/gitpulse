# GitPulse

[![CI](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml) [![Go](https://img.shields.io/badge/Go-1.26.1-00ADD8.svg)](go.mod) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Local-first git activity analytics for developers who want honest signals without uploading source code.**

GitPulse keeps live work, commit history, and push activity as separate ledgers. The current codebase is a Go application backed by SQLite with plain SQL via `database/sql`, a Cobra CLI, and a browser dashboard built with Bun, TypeScript, React, Vite, TanStack Router, TanStack Query, and Tailwind CSS.

> **Status:** Active and usable today as a Go CLI plus local web dashboard. Broader add/import/rescan/rebuild smoke coverage, a background watcher, and packaged desktop releases are still ahead. See [BUILD.md](BUILD.md) for the execution ledger and next steps.

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
- Bun
- TypeScript
- React + Vite
- TanStack Router + TanStack Query
- Tailwind CSS + shadcn/ui patterns
- Biome

**Implemented commands and surfaces**

- `gitpulse serve` to start the local dashboard server
- `gitpulse add <path>` to register a repo or discover repos under a folder
- `gitpulse rescan` to refresh repository snapshots
- `gitpulse import` to import commit history
- `gitpulse rebuild-rollups` to recompute sessions, rollups, and achievements
- `gitpulse doctor` for environment and configuration diagnostics
- React SPA dashboard, repositories, repository detail, sessions, achievements, and settings pages
- Go-served JSON API endpoints backing the browser UI
- settings page writes the current configurable UI surface back to the active TOML config file
- SQLite schema/query code for tracked targets, repositories, snapshots, file activity, commits, pushes, sessions, rollups, achievements, and settings
- sessionization, streak, score, and achievement logic in Go

## Quick start

### Prerequisites

- Go 1.26.1
- Bun 1.1+
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
cd web && bun install && bun run build
cd ..
go test ./...
go run ./cmd/gitpulse serve
```

Then open <http://127.0.0.1:7467>.

The Go server serves the built SPA from `web/dist`. Build the SPA before starting `gitpulse serve`.

### Frontend development

```bash
cd web
bun install
bun run dev
```

For the Go server to use the SPA, build the browser UI first:

```bash
cd web
bun run build
```

### Common commands

```bash
# Add a single repo or discover repos under a folder
go run ./cmd/gitpulse add /path/to/code

# Refresh tracked repositories
go run ./cmd/gitpulse rescan --all

# Import recent commit history
go run ./cmd/gitpulse import --all --days 30

# Rebuild derived analytics
go run ./cmd/gitpulse rebuild-rollups

# Check config and environment
go run ./cmd/gitpulse doctor
```

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
├── web/                       # Bun + React + Vite + TypeScript SPA
├── internal/config/           # Config loading and platform paths
├── internal/db/               # SQLite connection + plain SQL queries + schema embed
├── internal/filter/           # Include/exclude path matching
├── internal/git/              # Git subprocess parsing and discovery
├── internal/metrics/          # Score, streak, achievement logic
├── internal/models/           # Shared domain/view structs and API shapes
├── internal/runtime/          # Orchestration and view assembly
├── internal/sessions/         # Sessionization logic
├── internal/web/              # net/http handlers, JSON API routes, and SPA serving
├── migrations/                # SQLite migration files
├── docs/architecture.md       # Current architecture notes
├── BUILD.md                   # Execution manual and verification log
└── ROADMAP.md                 # Product roadmap
```

## Verification

- `cd web && bun run build`
- `go test ./...`
- `go build ./cmd/gitpulse`
- `go run ./cmd/gitpulse --help`

## License

MIT

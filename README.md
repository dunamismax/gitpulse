# GitPulse

Local-first git activity analytics for developers who want honest signals without uploading source code.

GitPulse keeps live work, commit history, and push activity as separate ledgers. The current rewrite is centered on a Go runtime, PostgreSQL, and plain server-rendered HTML.

[![CI](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Status

GitPulse is in an active rewrite and recovery pass.

Current active stack:

- Go 1.25+
- PostgreSQL 14+
- `pgx/v5` with raw SQL only
- Cobra CLI
- `net/http` web server
- Plain HTML templates + existing CSS/JS assets

Current repo reality:

- The Go rewrite now builds successfully.
- The rescued implementation includes CLI commands, PostgreSQL schema/query code, git parsing, analytics rebuild logic, and web routes/templates.
- The legacy Rust/Tauri tree is still present in the repo as migration reference only.
- The rewrite is not feature-complete yet and this pass did not claim full end-to-end runtime validation against a live PostgreSQL dataset.

For the detailed rewrite ledger and next steps, see [REWRITE_TRACKER.md](REWRITE_TRACKER.md). For the operator handoff manual, see [BUILD.md](BUILD.md).

## What exists in the Go rewrite today

- `gitpulse serve` to start the local dashboard server
- `gitpulse add <path>` to register a repo or discover repos under a folder
- `gitpulse rescan` to refresh repository snapshots
- `gitpulse import` to import commit history
- `gitpulse rebuild-rollups` to recompute sessions, rollups, and achievements
- `gitpulse doctor` for environment and configuration diagnostics
- PostgreSQL schema for tracked targets, repositories, snapshots, file activity, commits, pushes, sessions, rollups, achievements, and settings
- Dashboard, repositories, repository detail, sessions, achievements, and settings routes
- Sessionization, streak, score, and achievement logic in Go

## Not finished yet

- Background watcher / continuous monitoring loop
- Settings persistence from the web form
- Dedicated end-to-end integration tests against a real PostgreSQL instance
- Thin Zig/C native shell replacement for the retired Tauri desktop path
- Final removal of the legacy Rust codebase

## Why GitPulse?

- **Local-first**: no source upload, no cloud dependency for core use
- **Separate ledgers**: live work, committed work, and pushed work are not mashed into one fake metric
- **Inspectable data**: PostgreSQL + raw SQL keeps storage transparent
- **Rebuildable analytics**: sessions, rollups, and achievements are derived from stored events
- **Portable surface area**: CLI and local web dashboard share the same Go runtime

## Quick start

### Prerequisites

- Go 1.25+
- Git 2.30+
- PostgreSQL 14+

### Configure PostgreSQL

Create a local database:

```bash
createdb gitpulse
```

Create a config file from the example:

```bash
cp gitpulse.example.toml ~/Library/Application\ Support/gitpulse/gitpulse.toml
```

Minimal database config:

```toml
[database]
dsn = "postgres://localhost/gitpulse?sslmode=disable"
```

You can also use environment overrides:

```bash
export GITPULSE_DATABASE__DSN='postgres://localhost/gitpulse?sslmode=disable'
```

### Build and run

```bash
go test ./...
go run ./cmd/gitpulse serve
```

Then open <http://127.0.0.1:7467>.

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

## Configuration paths

Reported by `gitpulse doctor` and discovered by the Go runtime:

- macOS: `~/Library/Application Support/gitpulse/gitpulse.toml`
- Linux: `~/.config/gitpulse/gitpulse.toml`
- Windows: `%APPDATA%\gitpulse\gitpulse.toml`

## Repository layout

```text
.
├── cmd/gitpulse/              # Cobra CLI entrypoint
├── internal/config/           # Config loading and platform paths
├── internal/db/               # pgx connection + raw SQL queries + schema embed
├── internal/filter/           # Include/exclude path matching
├── internal/git/              # Git subprocess parsing and discovery
├── internal/metrics/          # Score, streak, achievement logic
├── internal/models/           # Shared domain/view structs
├── internal/runtime/          # Orchestration and view assembly
├── internal/sessions/         # Sessionization logic
├── internal/web/              # net/http handlers and render helpers
├── templates/                 # HTML pages and partials
├── assets/                    # Reused static assets
├── migrations/001_init.sql    # PostgreSQL schema baseline for the rewrite
├── docs/architecture.md       # Current Go rewrite architecture
├── BUILD.md                   # Execution manual and verification log
└── REWRITE_TRACKER.md         # Rewrite progress and next-step ledger
```

## Legacy code note

The old Rust workspace is still present during the migration for parity checks and rescue work. It is not the target architecture. New implementation work should go into the Go path, and any future native wrapper work should be Zig/C based.

## Verification run for this recovery pass

- `go mod tidy`
- `go test ./...`

## License

MIT

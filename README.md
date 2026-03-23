# GitPulse

Local-first git activity analytics for developers who want honest signals without uploading source code.

GitPulse keeps live work, commit history, and push activity as separate ledgers. The current codebase is the Go rewrite: Go runtime, PostgreSQL, raw SQL via `pgx/v5`, and a local web dashboard rendered with plain HTML templates.

[![CI](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Status

GitPulse is still mid-rewrite, but the repository truth is now clean:

- active stack: Go 1.25+, PostgreSQL 14+, `pgx/v5`, Cobra, `net/http`, plain HTML templates
- no legacy Rust/Tauri source or Rust toolchain files remain in-tree
- no native desktop shell is implemented in this repo right now
- future native packaging, if it still matters, should be a thin Zig/C wrapper over the Go runtime

What exists today:

- `gitpulse serve` to start the local dashboard server
- `gitpulse add <path>` to register a repo or discover repos under a folder
- `gitpulse rescan` to refresh repository snapshots
- `gitpulse import` to import commit history
- `gitpulse rebuild-rollups` to recompute sessions, rollups, and achievements
- `gitpulse doctor` for environment and configuration diagnostics
- PostgreSQL schema/query code for tracked targets, repositories, snapshots, file activity, commits, pushes, sessions, rollups, achievements, and settings
- dashboard, repositories, repository detail, sessions, achievements, and settings routes
- sessionization, streak, score, and achievement logic in Go

What is not finished yet:

- live PostgreSQL smoke validation captured in-repo as repeatable integration coverage
- background watcher / continuous monitoring loop
- settings persistence from the web form
- any future Zig/C native shell or packaging workflow

For the execution ledger and next steps, see [BUILD.md](BUILD.md). For the rewrite checklist, see [REWRITE_TRACKER.md](REWRITE_TRACKER.md).

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

Find your config path with:

```bash
go run ./cmd/gitpulse doctor
```

Minimal config:

```toml
[database]
dsn = "postgres://localhost/gitpulse?sslmode=disable"
```

Environment override example:

```bash
export GITPULSE_DATABASE__DSN='postgres://localhost/gitpulse?sslmode=disable'
```

See [gitpulse.example.toml](gitpulse.example.toml) for the full config surface.

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
├── assets/                    # Static assets used by the local web UI
├── migrations/001_init.sql    # PostgreSQL schema baseline
├── docs/architecture.md       # Current architecture notes
├── BUILD.md                   # Execution manual and verification log
└── REWRITE_TRACKER.md         # Rewrite progress and next-step ledger
```

## Verification in this cleanup pass

- `go test ./...`
- `go build ./cmd/gitpulse`
- `go run ./cmd/gitpulse --help`
- stale-reference scan for Rust/Cargo/Tauri terms across tracked docs/config

## License

MIT

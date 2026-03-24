# BUILD.md

## Purpose

This is the execution manual for GitPulse.

Use it to answer four things quickly:

- what the active codepath is
- what currently works
- what still blocks an operator-ready workflow
- what the next sensible implementation step should be

If code and docs disagree, fix both in the same change.

---

## Mission

Ship a local-first git analytics tool that tracks repository activity without uploading source code.

Product rules:

- live work, committed work, and pushed work remain separate ledgers
- all persisted state stays local
- relational data stays the default
- SQLite is the active storage layer
- Go owns the persistence layer; the React SPA frontend is an operator surface, not the system of record
- plain SQL stays explicit and inspectable unless backend complexity later earns `sqlc`
- CLI and local web UI share one runtime

---

## Current repo snapshot

Last reviewed: 2026-03-23
Branch: `main`
Host used for this pass: macOS

### Active implementation path

The active implementation lives in:

- `go.mod`
- `cmd/gitpulse/`
- `frontend/`
- `internal/config/`
- `internal/db/`
- `internal/filter/`
- `internal/git/`
- `internal/metrics/`
- `internal/models/`
- `internal/runtime/`
- `internal/sessions/`
- `internal/web/`
- `migrations/`

Transition-only fallback paths still present:

- `templates/`
- `assets/`

### Implementation status

What is done in the current Go + Astro path:

- Cobra CLI with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- SQLite connection setup, embedded schema, and plain SQL query files
- git subprocess helpers for repo discovery, snapshot parsing, and history import
- analytics rebuild flow for sessions, rollups, streaks, score, and achievements
- `net/http` server with JSON API routes for dashboard, repositories, repository detail, sessions, achievements, and settings
- Bun + TypeScript + React + Vite SPA under `frontend/` with TanStack Router, TanStack Query, Tailwind CSS, and Biome
- Go server wiring that serves the built SPA from `frontend/dist` with catch-all fallback
- legacy Go template rendering still available as a fallback when the SPA build output is missing

What is not done yet:

- broader live local smoke coverage beyond compile/test/build checks
- continuous watcher / background monitoring loop
- packaged desktop release workflow

---

## Source-of-truth map

| File | Owns |
|------|------|
| `BUILD.md` | execution truth, verification log, next steps |
| `README.md` | public-facing project status and local run instructions |
| `AGENTS.md` | concise repo memory for future agents |
| `docs/architecture.md` | active Go + Astro architecture |
| `frontend/` | browser UI source (React + Vite SPA), build output in `dist/` |
| `gitpulse.example.toml` | config surface for the Go runtime |
| `internal/db/schema.sql` | embedded startup schema |
| `migrations/` | repo-visible SQL migration history |
| `.github/workflows/ci.yml` | automated validation for the active Go path |

---

## Build and run workflow

### Prerequisites

- Go 1.26.1
- Bun 1.1+
- Git 2.30+

### Local config

The runtime defaults to a SQLite file in the platform data directory. A config file is optional.

Default config paths:

- macOS: `~/Library/Application Support/gitpulse/gitpulse.toml`
- Linux: `~/.config/gitpulse/gitpulse.toml`
- Windows: `%APPDATA%\gitpulse\gitpulse.toml`

Default database paths:

- macOS: `~/Library/Application Support/gitpulse/data/gitpulse.db`
- Linux: `~/.config/gitpulse/data/gitpulse.db`
- Windows: `%APPDATA%\gitpulse\data\gitpulse.db`

Minimum optional config:

```toml
[database]
path = "/absolute/path/to/gitpulse.db"
```

### Local commands

```bash
cd frontend && bun install && bun run build
cd ..
go test ./...
go run ./cmd/gitpulse serve
go run ./cmd/gitpulse add /path/to/repo-or-folder
go run ./cmd/gitpulse import --all --days 30
go run ./cmd/gitpulse rescan --all
go run ./cmd/gitpulse rebuild-rollups
go run ./cmd/gitpulse doctor
```

### Frontend-only development

```bash
cd frontend
bun install
bun run dev
bun run build
```

### CI commands

```bash
cd frontend && bun install && bun run build
cd ..
go test ./...
go build ./cmd/gitpulse
```

---

## Verification log

Only record commands that actually passed.

### Verified on 2026-03-23

- `cd frontend && bun run build`
- `go mod tidy`
- `go test ./...`
- `go build ./cmd/gitpulse`
- `go run ./cmd/gitpulse --help`
- `go run ./cmd/gitpulse doctor`
- `go test ./internal/... ./cmd/gitpulse/...`

### Not yet re-verified in this pass

- live local add/import/rescan/rebuild workflow against a seeded database

---

## Phase board

### Phase 1 — core local workflow

**Status:** done / checked

Checklist:

- [x] CLI commands for `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- [x] SQLite-backed storage and analytics rebuild path
- [x] React SPA dashboard pages backed by Go JSON endpoints
- [x] top-level docs aligned with the active runtime and frontend lane

### Phase 2 — operator-ready verification

**Status:** in progress

Checklist:

- [ ] validate real current startup, add, import, rescan, and rebuild flows
- [x] add focused integration coverage around the SQLite bootstrap and repository path
- [ ] improve config validation and operator-facing error messages

Exit criteria:

- one local operator flow is verified end to end
- integration coverage exists for the runtime paths that mutate persisted state

### Phase 3 — product hardening

**Status:** in progress

Checklist:

- [x] dashboard, repository detail, sessions, achievements, and settings routes exist in the Go tree
- [x] browser UI migrated to Bun/React/Vite/TypeScript with TanStack Router, TanStack Query, Tailwind CSS, and Biome
- [ ] harden those routes into a more polished operator surface
- [ ] implement or intentionally defer the continuous watcher / polling loop
- [ ] decide whether GitHub remote verification parity is still worth keeping and document the answer

### Phase 4 — optional distribution work

**Status:** planned

Checklist:

- [ ] decide whether packaged desktop releases are worth carrying at all
- [ ] define a release workflow only if it earns its keep
- [ ] keep desktop packaging clearly optional until the core runtime is operator-solid

### Phase 5 — stack alignment and quality

**Status:** in progress

Checklist:

- [x] align runtime storage with the SQLite-first repo doctrine
- [x] keep data relational and local-first
- [x] keep plain SQL instead of adding a query abstraction layer
- [x] update `go.mod` toolchain directive to Go 1.26.1
- [ ] replace `viper` with `koanf` or plain env vars and flags only if config churn justifies it
- [ ] add a `golangci-lint` step to `ci.yml`
- [ ] add a `govulncheck` step to `ci.yml`
- [ ] add a `/metrics` Prometheus endpoint behind an explicit flag or admin listener
- [ ] expose `pprof` on an admin-only path separate from the public web listener
- [ ] extend test coverage with table-driven tests for git parsing functions in `internal/git/`
- [ ] add fuzz tests for git subprocess output parsers in `snapshot.go` and `git.go`

Exit criteria:

- repo docs match the implementation
- the runtime is SQLite-first in both code and documentation
- `go.mod` toolchain matches Go 1.26.1

---

## Current assessment

- The codebase now matches the stack docs: local-first, relational, SQLite-backed, and plain SQL-first.
- The remaining risk is operational verification, not storage mismatch.
- The highest-value next step is an end-to-end local smoke flow that exercises `serve`, `add`, `import`, `rescan`, `rebuild-rollups`, and `doctor` against a temporary workspace.

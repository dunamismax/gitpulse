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
- PostgreSQL is the source of truth for persisted data
- raw SQL stays explicit and inspectable
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
- `internal/config/`
- `internal/db/`
- `internal/filter/`
- `internal/git/`
- `internal/metrics/`
- `internal/models/`
- `internal/runtime/`
- `internal/sessions/`
- `internal/web/`
- `templates/`
- `assets/`
- `migrations/`

### Implementation status

What is done in the current Go path:

- Cobra CLI with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- layered config loading, platform path discovery, and atomic TOML writes for web settings
- PostgreSQL connection, embedded schema, and raw SQL query files
- git subprocess helpers for repo discovery, snapshot parsing, and history import
- analytics rebuild flow for sessions, rollups, streaks, score, and achievements
- `net/http` server with page handlers and template rendering
- local HTML templates and shared static assets

What is not done yet:

- broader live PostgreSQL smoke coverage beyond compile/test/help checks
- continuous watcher / background monitoring loop
- packaged desktop release workflow

---

## Source-of-truth map

| File | Owns |
|------|------|
| `BUILD.md` | execution truth, verification log, next steps |
| `README.md` | public-facing project status and local run instructions |
| `AGENTS.md` | concise repo memory for future agents |
| `docs/architecture.md` | active Go architecture |
| `gitpulse.example.toml` | config surface for the Go runtime |
| `internal/db/schema.sql` | embedded startup schema |
| `migrations/` | repo-visible SQL migration history |
| `.github/workflows/ci.yml` | automated validation for the active Go path |

---

## Build and run workflow

### Prerequisites

- Go 1.25+
- Git 2.30+
- PostgreSQL 14+

### Local config

Default config paths:

- macOS: `~/Library/Application Support/gitpulse/gitpulse.toml`
- Linux: `~/.config/gitpulse/gitpulse.toml`
- Windows: `%APPDATA%\gitpulse\gitpulse.toml`

Minimum config:

```toml
[database]
dsn = "postgres://localhost/gitpulse?sslmode=disable"
```

### Local commands

```bash
createdb gitpulse
go test ./...
go run ./cmd/gitpulse serve
go run ./cmd/gitpulse add /path/to/repo-or-folder
go run ./cmd/gitpulse import --all --days 30
go run ./cmd/gitpulse rescan --all
go run ./cmd/gitpulse rebuild-rollups
go run ./cmd/gitpulse doctor
```

### CI commands

```bash
go test ./...
go build ./cmd/gitpulse
```

---

## Verification log

Only record commands that actually passed.

### Verified on 2026-03-23

- `GOCACHE=/tmp/gitpulse-gocache go test ./internal/config ./internal/runtime ./internal/web ./cmd/gitpulse`
- `GOCACHE=/tmp/gitpulse-gocache go build ./cmd/gitpulse`
- tracked-files scan for stale tracker references

### Not yet re-verified in this pass

- full add/import/rescan/rebuild workflow against a live PostgreSQL database
- web route smoke against a running local server

---

## Phase board

### Phase 1 — core local workflow

- **done** CLI commands for serve, add, rescan, import, rebuild-rollups, and doctor
- **done** PostgreSQL-backed storage and analytics rebuild path
- **done** local web dashboard routes and templates
- **done** top-level docs aligned with the active Go runtime

### Phase 2 — operator-ready verification

- **in progress** validate real PostgreSQL startup, add, import, rescan, and rebuild flows
- **not started** add focused integration tests around DB-backed runtime behavior
- **not started** improve config validation and operator-facing error messages

### Phase 3 — product hardening

- **in progress** dashboard, repository detail, sessions, achievements, and settings routes exist in the Go tree, and settings save back to the TOML config file
- **not started** continuous watcher / polling loop
- **not started** GitHub remote verification parity where it is still worth keeping

### Phase 4 — optional distribution work

- **not started** decide whether packaged desktop releases are worth carrying at all
- **not started** define a release workflow only if it earns its keep

---

## Decisions

- 2026-03-23: The repo documentation should describe the active Go + PostgreSQL + raw SQL implementation directly.
- 2026-03-23: Keep top-level docs honest about scaffold and TODO areas instead of implying shipped parity that has not been re-verified.
- 2026-03-23: Treat packaged desktop distribution as optional follow-on work, not a current product surface.

---

## Risks

- The Go path compiles and tests, but the end-to-end DB workflow still needs broader live verification.
- `internal/db/schema.sql`, `migrations/0001_init.sql`, and `migrations/001_init.sql` must remain aligned until migration history is consolidated.
- Packaged desktop release work is intentionally out of scope until the core runtime is solid.

---

## Next best moves

1. Run a live PostgreSQL-backed smoke path: `serve`, `add`, `import`, `rebuild-rollups`, `doctor`.
2. Add a small integration test harness that provisions a temporary database and exercises the runtime.
3. Implement or intentionally defer the background monitoring loop with explicit docs.
4. Decide later whether packaged desktop releases are worth building at all.

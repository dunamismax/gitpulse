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
- layered config loading, platform path discovery, and atomic TOML writes for settings
- PostgreSQL connection, embedded schema, and raw SQL query files
- git subprocess helpers for repo discovery, snapshot parsing, and history import
- analytics rebuild flow for sessions, rollups, streaks, score, and achievements
- `net/http` server with JSON API routes for dashboard, repositories, repository detail, sessions, achievements, and settings
- Bun + TypeScript + Astro + Alpine browser frontend under `frontend/`
- Go server wiring that serves the built Astro app from `frontend/dist`
- legacy Go template rendering still available as a fallback when the Astro build output is missing

What is not done yet:

- broader live PostgreSQL smoke coverage beyond compile/test/build checks
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
| `frontend/` | browser UI source, scripts, layout, styles, and Astro build output |
| `gitpulse.example.toml` | config surface for the Go runtime |
| `internal/db/schema.sql` | embedded startup schema |
| `migrations/` | repo-visible SQL migration history |
| `.github/workflows/ci.yml` | automated validation for the active Go path |

---

## Build and run workflow

### Prerequisites

- Go 1.25+
- Bun 1.1+
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

- `cd frontend && bun install`
- `cd frontend && bun run build`
- `GOCACHE=/tmp/gitpulse-gocache go test ./internal/config ./internal/runtime ./internal/web ./cmd/gitpulse`
- `GOCACHE=/tmp/gitpulse-gocache go build ./cmd/gitpulse`

### Not yet re-verified in this pass

- full add/import/rescan/rebuild workflow against a live PostgreSQL database
- browser route smoke against a running local server with a seeded database

---

## Phase board

### Phase 1 — core local workflow

**Status:** done / checked

Checklist:

- [x] CLI commands for `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- [x] PostgreSQL-backed storage and analytics rebuild path
- [x] Astro-owned local web dashboard pages backed by Go JSON endpoints
- [x] top-level docs aligned with the active runtime and frontend lane

### Phase 2 — operator-ready verification

**Status:** in progress

Checklist:

- [ ] validate real PostgreSQL startup, add, import, rescan, and rebuild flows
- [ ] add focused integration tests around DB-backed runtime behavior
- [ ] improve config validation and operator-facing error messages

Exit criteria:

- one live PostgreSQL-backed operator flow is verified end to end
- integration coverage exists for the runtime paths that mutate persisted state

### Phase 3 — product hardening

**Status:** in progress

Checklist:

- [x] dashboard, repository detail, sessions, achievements, and settings routes exist in the Go tree
- [x] browser UI migrated to Bun/Astro/TypeScript/Alpine with a narrow JSON API boundary
- [ ] harden those routes into a more polished operator surface
- [ ] implement or intentionally defer the continuous watcher / polling loop
- [ ] decide whether GitHub remote verification parity is still worth keeping and document the answer

### Phase 4 — optional distribution work

**Status:** planned

Checklist:

- [ ] decide whether packaged desktop releases are worth carrying at all
- [ ] define a release workflow only if it earns its keep
- [ ] keep desktop packaging clearly optional until the core runtime is operator-solid

### Phase 5 — tech stack alignment

**Status:** planned

Checklist:

- [ ] update `go.mod` toolchain directive to Go 1.26.1 to match the canonical stack version
- [ ] replace `viper` with `koanf` or plain env vars and flags if config churn justifies it
- [ ] introduce `sqlc` for typed query generation from the raw SQL across `internal/db/`
- [ ] add `goose` and consolidate schema/bootstrap migration handling
- [ ] add a `golangci-lint` step to `ci.yml`
- [ ] add a `govulncheck` step to `ci.yml`
- [ ] add a `/metrics` Prometheus endpoint behind an explicit flag or admin listener
- [ ] expose `pprof` on an admin-only path separate from the public web listener
- [ ] extend test coverage with table-driven tests for git parsing functions in `internal/git/`
- [ ] add fuzz tests for git subprocess output parsers in `snapshot.go` and `git.go`

Exit criteria:

- `go.mod` toolchain matches Go 1.26.1
- config loading no longer depends on `viper`
- at least one `internal/db/` query area is replaced with `sqlc`-generated code and the pattern is documented
- CI runs `golangci-lint` and `govulncheck` on every push
- a `/metrics` endpoint exists and returns valid Prometheus exposition format

---

## Decisions

- 2026-03-23: The repo documentation should describe the active Go + PostgreSQL implementation directly.
- 2026-03-23: Keep top-level docs honest about scaffold and TODO areas instead of implying shipped parity that has not been re-verified.
- 2026-03-23: Treat packaged desktop distribution as optional follow-on work, not a current product surface.
- 2026-03-23: Move the browser-facing UI to a Bun + Astro + TypeScript + Alpine frontend, with Go serving the built app and owning the JSON API boundary.

---

## Risks

- The Go path compiles and the Astro frontend builds, but the end-to-end DB workflow still needs broader live verification.
- The repo currently carries transition-only legacy template and asset paths to avoid a hard break when `frontend/dist` is missing.
- Packaged desktop release work is intentionally out of scope until the core runtime is solid.

---

## Next best moves

1. Run a live PostgreSQL-backed smoke path: `serve`, `add`, `import`, `rebuild-rollups`, `doctor`.
2. Add focused API tests for the new JSON handlers in `internal/web/`.
3. Decide whether to keep or fully remove the legacy template fallback after one more verification pass.
4. Implement or intentionally defer the background monitoring loop with explicit docs.

# BUILD.md

## Purpose

This is the execution manual for the GitPulse rewrite.

Use it to answer four things quickly:

- what the active codepath is
- what was rescued and verified
- what still blocks parity
- what the next sensible implementation step should be

If code and docs disagree, fix both in the same change.

---

## Mission

Ship a local-first git analytics tool that tracks repository activity without uploading source code.

Product rules that still matter during the rewrite:

- live work, committed work, and pushed work remain separate ledgers
- all persisted state stays local
- PostgreSQL is the source of truth for persisted data
- raw SQL stays explicit and inspectable
- CLI and local web UI share one runtime
- any future native shell should be thin and built with Zig/C, not Rust

---

## Current repo snapshot

Last reviewed: 2026-03-23
Branch: `main`
Host used for this pass: macOS

### Active implementation path

The active rewrite lives in:

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
- `migrations/001_init.sql`

### Legacy reference path

These files remain for migration reference only and should not receive new feature work:

- `Cargo.toml`, `Cargo.lock`
- `apps/`
- `crates/`
- Rust-era docs not yet rewritten elsewhere

### Rewrite status

**Current phase: recovery complete, bootstrap compile green, parity work still in progress.**

What is done in the Go path:

- Cobra CLI with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- layered config loading and platform path discovery
- PostgreSQL connection, embedded schema, and raw SQL query files
- git subprocess helpers for repo discovery, snapshot parsing, and history import
- analytics rebuild flow for sessions, rollups, streaks, score, and achievements
- `net/http` server with page handlers and HTMX-style partial endpoints
- rescued HTML templates and reused static assets

What is not done yet:

- continuous watcher / background monitoring loop
- settings persistence writes from the web UI
- end-to-end verification against a live PostgreSQL-backed workflow in this rewrite branch of history
- Zig/C native shell replacement for the old desktop path
- retirement of the legacy Rust tree

---

## Rescue ledger

### Source directories inspected

- `.claude/worktrees/awesome-shirley`
- `.claire/worktrees/awesome-shirley`
- `.claire/worktrees/serene-hawking`

### Rescue outcome

Primary rescued source:

- `.claude/worktrees/awesome-shirley`

Recovered into `main`:

- `go.mod`
- `cmd/gitpulse/main.go`
- all current `internal/*` Go packages
- `templates/` HTML files
- `migrations/001_init.sql`

Observed but not promoted:

- `.claire/worktrees/awesome-shirley/internal/db/snapshots.go` contained only a truncated `package db` stub and was not useful
- `.claire/worktrees/serene-hawking` contained no files worth rescuing

Cleanup completed after rescue:

- moved `.claude/` and `.claire/` to Trash after promoting the useful files into `main`

### Recovery fixes applied after rescue

- generated `go.sum` and resolved module dependencies with `go mod tidy`
- fixed `internal/git/git.go` to use the local `TouchedPath` type consistently
- removed an unused variable in `internal/runtime/runtime.go`
- added missing `Runtime.ListRepos` and `Runtime.FindRepo` wrappers so the CLI builds
- rewrote top-level docs and config example to match the Go rewrite instead of the legacy Rust stack

---

## Source-of-truth map

| File | Owns |
|------|------|
| `BUILD.md` | execution truth, rescue history, verification log, next steps |
| `REWRITE_TRACKER.md` | rewrite checklist and resumable handoff state |
| `README.md` | public-facing project status and local run instructions |
| `AGENTS.md` | concise repo memory for future agents |
| `docs/architecture.md` | active Go architecture |
| `gitpulse.example.toml` | config surface for the Go rewrite |
| `internal/db/schema.sql` | embedded startup schema |
| `migrations/001_init.sql` | explicit PostgreSQL migration baseline for the rewrite |
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

- `go mod tidy`
- `go test ./...`
- `go run ./cmd/gitpulse --help`

### Not yet re-verified in this pass

- full add/import/rescan/rebuild workflow against a live PostgreSQL database
- web route smoke against a running local server
- any future Zig/C shell work

---

## Phase board

### Phase 0 — rescue and stabilization

- **done** rescue viable Go rewrite files from leftover worktree directories
- **done** make the rescued Go tree compile cleanly
- **done** rewrite top-level docs around the active Go/PostgreSQL architecture
- **done** restore CI to validate the active Go path

### Phase 1 — operator-ready local workflow

- **in progress** validate real PostgreSQL startup, add, import, rescan, and rebuild flows
- **not started** add focused integration tests around DB-backed runtime behavior
- **not started** improve config validation and operator-facing error messages

### Phase 2 — product parity with the old app where still worth keeping

- **in progress** dashboard, repository detail, sessions, achievements, and settings routes exist in the Go tree
- **not started** continuous watcher / polling loop
- **not started** GitHub remote verification parity
- **not started** full settings persistence from the web layer

### Phase 3 — post-Rust cutover

- **not started** remove the legacy Rust tree once the Go path fully replaces it
- **not started** add a thin Zig/C native shell if native packaging still matters
- **not started** harden release workflow around the new stack

---

## Decisions

- 2026-03-23: The active rewrite target is Go + PostgreSQL + raw SQL. Rust remains reference-only during migration.
- 2026-03-23: Rescue work from leftover worktree directories before deleting them; do not overwrite unmerged rewrite work blindly.
- 2026-03-23: Keep top-level docs honest about recovery status instead of claiming shipped parity that has not been re-verified.
- 2026-03-23: Any future native wrapper work should be Zig/C based, with the web/runtime stack remaining the product core.

---

## Risks

- The rescued Go path builds, but the end-to-end DB workflow still needs live verification.
- Legacy Rust files can confuse contributors if docs drift again.
- `internal/db/schema.sql` and `migrations/001_init.sql` must remain aligned until a real migration runner history exists.
- The web settings form currently redirects without persisting changes.

---

## Next best moves

1. Run a live PostgreSQL-backed smoke path: `serve`, `add`, `import`, `rebuild-rollups`, `doctor`.
2. Add a small integration test harness that provisions a temporary database and exercises the runtime.
3. Implement or intentionally defer the background monitoring loop with explicit docs.
4. Start retiring or quarantining the legacy Rust tree once the Go happy path is re-verified.

# GitPulse Agent Notes

Read `BUILD.md` first. It is the execution manual and current handoff ledger.

## Repo state

GitPulse is in an active rewrite from the legacy Rust/Tauri workspace to a Go-first stack.

Current active implementation path:

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

Legacy reference only:

- `Cargo.toml`, `Cargo.lock`
- `apps/`, `crates/`
- Rust-era docs that have not yet been rewritten

Do not add new product behavior in Rust. New work goes into Go, with PostgreSQL via `pgx/v5` and raw SQL only.

## Current product shape

What exists in the Go rewrite today:

- Cobra CLI entrypoint with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- PostgreSQL schema + raw SQL query layer
- Git subprocess integration for repo discovery, snapshots, and history import
- Rebuildable sessions, rollups, streaks, scoring, and achievements logic
- net/http server with HTML templates and HTMX-style partial endpoints
- Reused static assets from the legacy app

What is not complete yet:

- File watcher / background monitoring loop
- End-to-end integration tests against a live PostgreSQL instance
- Persistent settings writes from the web UI
- Zig/C desktop shell replacement for the retired Tauri path
- Final removal of the legacy Rust tree

## Working rules

- Keep `README.md`, `BUILD.md`, `REWRITE_TRACKER.md`, and `docs/architecture.md` aligned with code.
- Treat `REWRITE_TRACKER.md` as the resume point for the rewrite.
- Prefer the narrowest truthful verification first: `go test ./...`, then a focused CLI smoke command.
- For database work, keep SQL explicit in `internal/db/`; no ORM.
- If you rescue work from scratch dirs or old worktrees, document what was rescued before deleting anything.

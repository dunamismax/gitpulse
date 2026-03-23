# GitPulse Agent Notes

Read `BUILD.md` first. It is the execution manual and current handoff ledger.

## Repo state

GitPulse is a Go-first local analytics tool in active rewrite/hardening.

Current implementation path:

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

Rust/Tauri source and Rust toolchain files have been removed from the repo. Do not reintroduce them casually.

New work goes into Go, with PostgreSQL via `pgx/v5` and raw SQL only.

## Current product shape

What exists in the Go rewrite today:

- Cobra CLI entrypoint with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- PostgreSQL schema + raw SQL query layer
- Git subprocess integration for repo discovery, snapshots, and history import
- rebuildable sessions, rollups, streaks, scoring, and achievements logic
- `net/http` server with HTML templates and partial endpoints
- static assets for the local web UI

What is not complete yet:

- file watcher / background monitoring loop
- end-to-end integration tests against a live PostgreSQL instance
- persistent settings writes from the web UI
- any Zig/C native shell or packaging path

## Working rules

- Keep `README.md`, `BUILD.md`, `REWRITE_TRACKER.md`, and `docs/architecture.md` aligned with code.
- Treat `REWRITE_TRACKER.md` as the resume point for the rewrite.
- Prefer the narrowest truthful verification first: `go test ./...`, then `go build ./cmd/gitpulse`, then a focused CLI smoke command.
- For database work, keep SQL explicit in `internal/db/`; no ORM.
- If you decide to reintroduce native packaging in the future, document it as new work. Do not imply it already exists.

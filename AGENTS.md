# GitPulse Agent Notes

Read `BUILD.md` first. It is the execution manual and current handoff ledger.

## Repo state

GitPulse is a Go-first local analytics tool for repository activity.

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
- `migrations/`

New work goes into Go, with PostgreSQL via `pgx/v5` and raw SQL only.

## Current product shape

What exists today:

- Cobra CLI entrypoint with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- PostgreSQL schema + raw SQL query layer
- Git subprocess integration for repo discovery, snapshots, and history import
- rebuildable sessions, rollups, streaks, scoring, and achievements logic
- `net/http` server with HTML templates and partial endpoints
- static assets for the local web UI

What is not complete yet:

- file watcher / background monitoring loop
- broader end-to-end integration coverage against a live PostgreSQL instance
- packaged desktop release workflow

## Working rules

- Keep `README.md`, `BUILD.md`, and `docs/architecture.md` aligned with code.
- Prefer the narrowest truthful verification first: `go test ./...`, then `go build ./cmd/gitpulse`, then a focused CLI smoke command.
- For database work, keep SQL explicit in `internal/db/`; no ORM.
- Do not document packaging or release behavior that the repo does not implement.

# GitPulse Agent Notes

Read `BUILD.md` first. It is the execution manual and current handoff ledger.

## Repo state

GitPulse is a Go-first local analytics tool for repository activity.

Current implementation path:

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

Transition-only fallback paths still exist:

- `templates/`
- `assets/`

New backend work goes into Go. The current storage layer is PostgreSQL via `pgx/v5` with plain SQL, but GitPulse itself is more SQLite-shaped than PostgreSQL-earned. Do not start a half-migration unless the task is explicitly about storage cutover.

## Current product shape

What exists today:

- Cobra CLI entrypoint with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- current PostgreSQL schema + plain SQL query layer
- Git subprocess integration for repo discovery, snapshots, and history import
- rebuildable sessions, rollups, streaks, scoring, and achievements logic
- `net/http` server with JSON API routes and Astro frontend serving
- Bun + Astro + TypeScript + Alpine browser UI under `frontend/`

What is not complete yet:

- file watcher / background monitoring loop
- broader end-to-end integration coverage against the current live PostgreSQL path
- a deliberate SQLite migration plan for the long-term local-first default
- packaged desktop release workflow

## Working rules

- Keep `README.md`, `BUILD.md`, and `docs/architecture.md` aligned with code.
- Prefer the narrowest truthful verification first: `cd frontend && bun run build`, then `go test ./...`, then `go build ./cmd/gitpulse`, then a focused CLI smoke command.
- For database work, keep SQL explicit in `internal/db/`; no ORM theater, no MongoDB pivot, and no incidental storage migration work.
- Do not document packaging or release behavior that the repo does not implement.

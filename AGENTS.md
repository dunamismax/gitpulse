# GitPulse Agent Notes

Read `BUILD.md` first. It is the execution manual and current handoff ledger.

## Repo state

GitPulse is a Go-first local analytics tool for repository activity.

Active implementation path:

- `go.mod`
- `cmd/gitpulse/`
- `web/`
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


New backend work goes into Go. The active storage layer is SQLite via `database/sql` and `modernc.org/sqlite` with plain SQL.

## Current product shape

What exists today:

- Cobra CLI entrypoint with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- SQLite schema + plain SQL query layer
- Git subprocess integration for repo discovery, snapshots, and history import
- rebuildable sessions, rollups, streaks, scoring, and achievements logic
- `net/http` server with JSON API routes and SPA serving
- Bun + React + Vite + TypeScript SPA under `web/` with TanStack Router, TanStack Query, Tailwind CSS, and Biome

What is not complete yet:

- file watcher / background monitoring loop
- broader end-to-end add/import/rescan/rebuild verification against a seeded local database
- packaged desktop release workflow

## Working rules

- Keep `README.md`, `BUILD.md`, and `docs/architecture.md` aligned with code.
- Prefer the narrowest truthful verification first: `cd web && bun run build`, then `go test ./...`, then `go build ./cmd/gitpulse`, then a focused CLI smoke command.
- For database work, keep SQL explicit in `internal/db/`; no ORM theater and no incidental move of persistence into the browser UI lane.
- Do not document packaging or release behavior that the repo does not implement.

# GitPulse Agent Notes

Read `BUILD.md` first. It is the execution manual and current handoff ledger.

## Repo state

GitPulse is a Go-first local analytics tool for repository activity with a Python operator UI.

Active implementation path:

- `go.mod`
- `cmd/gitpulse/`
- `python-ui/`
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
- `net/http` server with JSON API routes and proxying to the Python operator UI
- FastAPI + Jinja2 + htmx operator UI under `python-ui/`

What is not complete yet:

- file watcher / background monitoring loop
- broader end-to-end add/import/rescan/rebuild verification against a real working database and workspace
- packaged desktop release workflow
- fuzz coverage for git parsing

## Working rules

- Keep `README.md`, `BUILD.md`, and `docs/architecture.md` aligned with code.
- Prefer the narrowest truthful verification first: `go test ./...`, then `go build ./cmd/gitpulse`, then Python UI checks, then a focused CLI smoke command.
- For database work, keep SQL explicit in `internal/db/`; no ORM theater and no incidental move of persistence into the UI lane.
- Do not document packaging or release behavior that the repo does not implement.

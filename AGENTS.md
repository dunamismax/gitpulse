# GitPulse Agent Notes

Start with `README.md`, `docs/operator-workflow.md`, and `docs/architecture.md`.

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
- a manual-first operator loop: add, import, rescan, rebuild, inspect

What is not complete yet:

- broader end-to-end add/import/rescan/rebuild verification against a real working database and workspace
- background watcher or poller support
- packaged desktop release workflow
- fuzz coverage for git parsing

## Working rules

- Keep `README.md`, `docs/operator-workflow.md`, and `docs/architecture.md` aligned with code.
- Prefer the narrowest truthful verification first: `go test ./...`, then `go build ./...`, then Python UI checks, then a focused CLI smoke command.
- For database work, keep SQL explicit in `internal/db/`; no ORM theater and no incidental move of persistence into the UI lane.
- Do not document packaging or release behavior that the repo does not implement.
- Do not imply automatic background tracking while the product remains manual-first.

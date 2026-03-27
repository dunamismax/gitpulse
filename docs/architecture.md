# GitPulse Architecture

GitPulse is a local-first Go application with SQLite persistence and plain SQL in the Go runtime. The backend remains the source of truth. The browser surface is in transition from the shipping React SPA under `web/` to a server-rendered Python UI under `python-ui/`, but `gitpulse serve` still serves the React build while the Python UI runs as a separate FastAPI process.

## Active stack

- Go for CLI, runtime orchestration, JSON API, git integration, analytics, and data access
- SQLite persistence via `database/sql`
- plain SQL for the data layer
- `net/http` in Go for the current local server and JSON API
- Bun + TypeScript + React + Vite for the current shipping dashboard in `web/`
- FastAPI + Jinja2 + htmx for the Python rewrite lane in `python-ui/`
- Alpine.js for small client-side interactions in the Python UI
- HTTPX for Python-to-Go API calls

Storage doctrine for this repo:

- SQLite is the implemented default
- Go owns persistence; both frontend lanes are operator surfaces, not the system of record
- keep data relational and local-first
- keep plain SQL unless backend complexity later earns `sqlc`
- transition frontend behavior in reversible slices rather than a big-bang cutover

## Transition architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                            surfaces                              │
│    CLI + React SPA (`web/`) + Python UI companion (`python-ui/`)│
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │       internal/web      │
                    │ JSON API + SPA serving  │
                    └────────────┬────────────┘
                                 │
                     ┌───────────▼───────────┐
                     │    internal/runtime    │
                     │ orchestration + views   │
                     └───────┬─────────┬──────┘
                             │         │
                  ┌──────────▼───┐ ┌───▼──────────────┐
                  │ internal/git │ │ internal/db      │
                  │ git CLI      │ │ SQLite/plain SQL │
                  └──────┬───────┘ └──────┬───────────┘
                         │                │
                  ┌──────▼──────┐   ┌────▼────────┐
                  │ analytics + │   │ local event │
                  │ sessions    │   │ store       │
                  └─────────────┘   └─────────────┘
```

## Package map

### `cmd/gitpulse`

Cobra CLI entrypoint. Owns command wiring only.

### `web`

React SPA with Vite build, TanStack Router routes, TanStack Query data fetching, Tailwind CSS styling, and Biome linting. Builds to `web/dist`. This remains the current shipping UI.

### `python-ui`

FastAPI application that renders Jinja2 templates, serves vendored local Alpine.js and htmx assets, forwards reads and writes to the existing Go JSON API, and now exposes first-run operator guidance plus explicit import/rescan/rebuild runbook controls. This is the active frontend rewrite lane, but not yet the default served entrypoint.

### `internal/config`

Platform path discovery, layered config loading, and atomic TOML writes for the settings page. Environment variables still override file values.

### `internal/db`

SQLite connection setup, embedded schema, plain SQL queries, and analytics persistence.

### `internal/filter`

Include/exclude glob logic for path filtering.

### `internal/git`

Git subprocess execution, repo discovery, snapshot parsing, and history import parsing.

### `internal/metrics`

Score, streak, and achievement logic.

### `internal/models`

Shared data structures passed between runtime, DB, JSON API, and the frontend lanes.

### `internal/runtime`

Application orchestration: add repo, refresh, import history, rebuild analytics, and assemble view models.

### `internal/sessions`

Sessionization logic over activity points.

### `internal/web`

`net/http` handlers, JSON endpoints, and SPA serving.

## Data flow

1. A repo or folder is added through the CLI or either browser UI.
2. `internal/git` discovers git roots and probes repo metadata.
3. `internal/db` persists tracked targets, repositories, snapshots, commits, push events, file activity, sessions, rollups, achievements, and settings.
4. `internal/runtime` rebuilds derived analytics from raw events.
5. `internal/web` exposes JSON endpoints, including manual operator action endpoints for import/rescan/rebuild, and still serves the built React SPA from `web/dist`.
6. The React SPA fetches the JSON API directly.
7. The Python UI calls the same JSON API through HTTPX, renders server-side templates, and turns those manual action endpoints into server-rendered runbook controls with inline feedback.

## Persistence model

Current tables:

- `tracked_targets`
- `repositories`
- `repo_status_snapshots`
- `file_activity_events`
- `commit_events`
- `push_events`
- `focus_sessions`
- `daily_rollups`
- `achievements`
- `settings`

Schema sources:

- `internal/db/schema.sql` for the embedded startup schema path
- `migrations/0001_init.sql` for the repo-visible SQLite migration file

## Design constraints

- New backend implementation work belongs in Go.
- SQLite is the supported database target.
- Keep persistence in Go; do not move schema ownership into either frontend lane unless the architecture materially changes.
- Keep data relational and local-first.
- Keep plain SQL unless backend complexity later earns `sqlc`.
- The Python UI should reach parity by consuming the existing Go API, not by re-implementing backend logic.
- The remaining frontend cutover problem is serving topology, not operator-page parity: the repo still needs a verified plan for how `gitpulse serve` should hand off to or co-serve the Python UI.
- Keep repo-controlled strings treated as untrusted input.
- Document new runtime or release surfaces only when code for them exists.

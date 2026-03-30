# GitPulse Architecture

GitPulse is a local-first Go application with SQLite persistence and plain SQL in the Go runtime. The Go backend remains the source of truth. The browser surface is now the Astro + Vue frontend under `frontend/web/`, built with Bun and served directly by the Go runtime.

The frontend migration plan is tracked in `BUILD.md`. The browser cutover is complete. The Bun workspace under `frontend/` now contains the shared TypeScript contract layer, the shipped Astro + Vue web app under `frontend/web/`, and the still-foundational terminal lane under `frontend/tui`. The legacy `python-ui/` directory remains only as temporary migration reference while repo cleanup finishes.

## Active stack

- Go for CLI, runtime orchestration, JSON API, git integration, analytics, and data access
- SQLite persistence via `database/sql`
- plain SQL for the data layer
- `net/http` in Go for the local server, JSON API, and static frontend serving
- Bun workspace under `frontend/`
- Astro + Vue for the operator web frontend
- shared TypeScript API contracts and client under `frontend/shared`

Storage doctrine for this repo:

- SQLite is the implemented default
- Go owns persistence; the frontend is an operator surface, not the system of record
- keep data relational and local-first
- keep plain SQL unless backend complexity later earns `sqlc`

## Serving architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                            surfaces                              │
│              CLI + Astro web frontend (`frontend/web`)           │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │       internal/web      │
                    │  JSON API + static UI   │
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

`gitpulse serve` starts the Go HTTP server and serves the built frontend from `frontend/web/dist`. The Go server handles `/api/*` directly and returns the appropriate built page shell for browser routes.

## Current ingestion model

GitPulse is manual-first today. No background watcher or poller runs inside the Go runtime. The supported operator loop is:

1. add repositories or parent folders
2. import recent history
3. rescan working trees
4. rebuild analytics from stored local events
5. inspect the dashboard or JSON API

The Astro frontend exposes that same manual loop through explicit runbook controls backed by the Go API.

## Package map

### `cmd/gitpulse`

Cobra CLI entrypoint. Owns command wiring and built frontend discovery.

### `frontend/shared`

Shared TypeScript contracts, API client, formatters, route map, screen map, and operator action metadata used by both frontend lanes.

### `frontend/web`

Astro + Vue browser frontend. Built to static output, hydrated against the live Go API, and served by `gitpulse serve`.

### `frontend/tui`

OpenTUI foundation shell. The real terminal operator console has not been implemented yet.

### `python-ui`

Legacy FastAPI + Jinja2 reference kept temporarily during repo cleanup. It is no longer launched by `gitpulse serve`.

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

Shared data structures passed between runtime, DB, JSON API, and frontend contracts.

### `internal/runtime`

Application orchestration: register repos, refresh live state, import history, rebuild analytics, and assemble view models.

### `internal/sessions`

Sessionization logic over activity points.

### `internal/web`

`net/http` handlers, JSON endpoints, and built frontend serving.

## Data flow

1. A repo or folder is added through the CLI or the browser UI.
2. `internal/git` discovers git roots and probes repo metadata so GitPulse can register new repositories without doing hidden imports or rebuilds.
3. `internal/db` persists tracked targets, repositories, snapshots, commits, push events, file activity, sessions, rollups, achievements, and settings.
4. The operator explicitly runs import, rescan, and rebuild actions when fresh history or live state needs to be pulled in.
5. `internal/runtime` rebuilds derived analytics from raw events only when rebuild is requested.
6. `internal/web` exposes JSON endpoints, including manual operator action endpoints for import, rescan, and rebuild, and serves the built Astro page shells for browser routes.
7. The Astro + Vue frontend fetches the Go JSON API directly on the same origin and renders the operator workflow in the browser.

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
- Keep persistence in Go; do not move schema ownership into the frontend.
- Keep data relational and local-first.
- Keep plain SQL unless backend complexity later earns `sqlc`.
- The frontend consumes the existing Go API, not re-implementing backend logic.
- Keep repo-controlled strings treated as untrusted input.
- Document new runtime or release surfaces only when code for them exists.

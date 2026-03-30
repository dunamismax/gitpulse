# GitPulse Architecture

GitPulse is a local-first Go application with SQLite persistence and plain SQL in the Go runtime. The Go backend remains the source of truth. The browser surface is a server-rendered Python UI under `python-ui/` served through the Go runtime via reverse proxy.

The frontend migration plan is tracked in `BUILD.md`. Today the browser UI is still Python, but the Go API now carries explicit frontend response contracts so the current Python UI and future Bun frontends can consume the same backend-owned shapes.

## Active stack

- Go for CLI, runtime orchestration, JSON API, git integration, analytics, and data access
- SQLite persistence via `database/sql`
- plain SQL for the data layer
- `net/http` in Go for the local server, JSON API, and reverse proxy to the Python UI
- FastAPI + Jinja2 + htmx for the operator UI in `python-ui/`
- Alpine.js for small client-side interactions in the Python UI
- HTTPX for Python-to-Go API calls

Storage doctrine for this repo:

- SQLite is the implemented default
- Go owns persistence; the Python UI is an operator surface, not the system of record
- keep data relational and local-first
- keep plain SQL unless backend complexity later earns `sqlc`

## Serving architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                            surfaces                              │
│              CLI + Python UI (`python-ui/`)                      │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │       internal/web      │
                    │ JSON API + UI proxy     │
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

`gitpulse serve` starts the Go HTTP server, launches the Python UI as a managed subprocess on an internal port, and reverse-proxies non-API browser requests to it. The Go server handles `/api/*` directly while forwarding all other paths to the Python UI.

## Current ingestion model

GitPulse is manual-first today. No background watcher or poller runs inside the Go runtime. The supported operator loop is:

1. add repositories or parent folders
2. import recent history
3. rescan working trees
4. rebuild analytics from stored local events
5. inspect the dashboard or JSON API

The Python UI exposes that same manual loop through explicit runbook controls backed by the Go API.

## Package map

### `cmd/gitpulse`

Cobra CLI entrypoint. Owns command wiring and Python UI subprocess lifecycle.

### `python-ui`

FastAPI application that renders Jinja2 templates, serves vendored local Alpine.js and htmx assets, forwards reads and writes to the existing Go JSON API, and exposes first-run operator guidance plus explicit import/rescan/rebuild runbook controls. This is the default operator UI, served through the Go runtime's reverse proxy.

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

Shared data structures passed between runtime, DB, JSON API, and the Python UI, including the explicit frontend response contracts used by migration-critical endpoints.

### `internal/runtime`

Application orchestration: register repos, refresh live state, import history, rebuild analytics, and assemble view models.

### `internal/sessions`

Sessionization logic over activity points.

### `internal/web`

`net/http` handlers, JSON endpoints, and reverse proxy to the Python UI.

## Data flow

1. A repo or folder is added through the CLI or the browser UI.
2. `internal/git` discovers git roots and probes repo metadata so GitPulse can register new repositories without doing hidden imports or rebuilds.
3. `internal/db` persists tracked targets, repositories, snapshots, commits, push events, file activity, sessions, rollups, achievements, and settings.
4. The operator explicitly runs import, rescan, and rebuild actions when fresh history or live state needs to be pulled in.
5. `internal/runtime` rebuilds derived analytics from raw events only when rebuild is requested.
6. `internal/web` exposes JSON endpoints, including manual operator action endpoints for import/rescan/rebuild, and reverse-proxies browser requests to the Python UI.
7. The Python UI calls the Go JSON API through HTTPX, renders server-side templates, and turns those manual action endpoints into server-rendered runbook controls with inline feedback.

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
- Keep persistence in Go; do not move schema ownership into the Python UI unless the architecture materially changes.
- Keep data relational and local-first.
- Keep plain SQL unless backend complexity later earns `sqlc`.
- The Python UI consumes the existing Go API, not re-implementing backend logic.
- Keep repo-controlled strings treated as untrusted input.
- Document new runtime or release surfaces only when code for them exists.

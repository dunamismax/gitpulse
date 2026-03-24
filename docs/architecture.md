# GitPulse Architecture

GitPulse is a local-first Go application with a browser dashboard built as a React SPA. The active implementation persists state in SQLite via `database/sql` and `modernc.org/sqlite`, with plain SQL kept inside the Go runtime.

The active stack is:

- Go for CLI, runtime, JSON API, git integration, analytics, and data access
- SQLite persistence via `database/sql`
- plain SQL for the data layer
- Bun + TypeScript + React + Vite for the browser UI
- TanStack Router for client-side routing
- TanStack Query for server-state management
- Tailwind CSS for styling
- Biome for lint and format

Storage doctrine for this repo:

- SQLite is the implemented default
- Go owns persistence; the React SPA is an operator surface, not the system of record
- keep data relational and local-first
- keep plain SQL unless backend complexity later earns `sqlc`

## System overview

```text
┌──────────────────────────────────────────────────────────┐
│                         surfaces                         │
│                 CLI + browser dashboard                  │
└────────────────────────────┬─────────────────────────────┘
                             │
                     ┌───────▼────────┐
                     │ internal/runtime│
                     │ orchestration   │
                     └───┬─────────┬───┘
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
                             │
                     ┌───────▼────────┐
                     │ internal/web   │
                     │ JSON API +     │
                     │ SPA serving    │
                     └───────┬────────┘
                             │
                     ┌───────▼────────┐
                     │ web/           │
                     │ React + Vite   │
                     └────────────────┘
```

## Package map

### `cmd/gitpulse`

Cobra CLI entrypoint. Owns command wiring only.

### `web`

React SPA with Vite build, TanStack Router routes, TanStack Query data fetching, Tailwind CSS styling, and Biome linting. Builds to `web/dist`.

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

Shared data structures passed between runtime, DB, JSON API, and the browser UI.

### `internal/runtime`

Application orchestration: add repo, refresh, import history, rebuild analytics, and assemble view models.

### `internal/sessions`

Sessionization logic over activity points.

### `internal/web`

`net/http` handlers, JSON endpoints, and SPA serving.

## Data flow

1. A repo or folder is added through the CLI or the browser UI.
2. `internal/git` discovers git roots and probes repo metadata.
3. `internal/db` persists tracked targets, repositories, snapshots, commits, push events, file activity, sessions, rollups, and achievements.
4. `internal/runtime` rebuilds derived analytics from raw events.
5. `internal/web` exposes JSON endpoints and serves the built SPA with an `index.html` catch-all for client-side routing.
6. The React SPA fetches those JSON endpoints via TanStack Query and renders the operator workflow in the browser.

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
- Keep persistence in Go; do not move schema ownership into the SPA lane unless the architecture materially changes.
- Keep data relational and local-first.
- Keep plain SQL unless backend complexity later earns `sqlc`.
- React owns the route/page lane for the browser UI via TanStack Router.
- TanStack Query handles all server-state fetching and caching.
- Zod validates API responses at the boundary.
- Keep repo-controlled strings treated as untrusted input.
- Document new runtime or release surfaces only when code for them exists.

# GitPulse Architecture

GitPulse is a local-first Go application with a browser dashboard built with Astro. The active implementation persists state in SQLite via `database/sql` and `modernc.org/sqlite`, with plain SQL kept inside the Go runtime.

The active stack is:

- Go for CLI, runtime, JSON API, git integration, analytics, and data access
- SQLite persistence via `database/sql`
- plain SQL for the data layer
- Bun + TypeScript + Astro + Alpine.js for the browser UI

Storage doctrine for this repo:

- SQLite is the implemented default
- Go owns persistence; the Astro frontend is an operator surface, not the system of record
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
                     │ Astro serving  │
                     └───────┬────────┘
                             │
                     ┌───────▼────────┐
                     │ frontend/      │
                     │ Astro + Alpine │
                     └────────────────┘
```

## Package map

### `cmd/gitpulse`

Cobra CLI entrypoint. Owns command wiring only.

### `frontend`

Astro pages, shared layout, TypeScript browser code, Alpine components, and CSS. Builds to `frontend/dist`.

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

Shared data structures passed between runtime, DB, JSON API, and frontend.

### `internal/runtime`

Application orchestration: add repo, refresh, import history, rebuild analytics, and assemble view models.

### `internal/sessions`

Sessionization logic over activity points.

### `internal/web`

`net/http` handlers, JSON endpoints, Astro frontend serving, and temporary legacy template fallback.

## Data flow

1. A repo or folder is added through the CLI or the browser UI.
2. `internal/git` discovers git roots and probes repo metadata.
3. `internal/db` persists tracked targets, repositories, snapshots, commits, push events, file activity, sessions, rollups, and achievements.
4. `internal/runtime` rebuilds derived analytics from raw events.
5. `internal/web` exposes JSON endpoints and serves the built Astro app.
6. The Astro frontend fetches those JSON endpoints and renders the operator workflow in the browser.

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
- Keep persistence in Go; do not move schema ownership into the Astro lane unless the architecture materially changes.
- Keep data relational and local-first.
- Keep plain SQL unless backend complexity later earns `sqlc`.
- Astro owns the page/layout lane for the browser UI.
- Alpine handles light browser interaction; keep hydration modest.
- Keep repo-controlled strings treated as untrusted input.
- Document new runtime or release surfaces only when code for them exists.

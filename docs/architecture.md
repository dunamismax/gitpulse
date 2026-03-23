# GitPulse Architecture

GitPulse is a local-first Go application with a browser dashboard built with Astro. The current implementation persists state in PostgreSQL, but that is a current-state implementation choice rather than the long-term default doctrine for this product.

The active stack is:

- Go for CLI, runtime, JSON API, git integration, analytics, and data access
- current PostgreSQL persistence via `pgx/v5`
- plain SQL for the current data layer
- Bun + TypeScript + Astro + Alpine.js for the browser UI

Storage doctrine for this repo:

- GitPulse is still a single-user, local-first product, so SQLite is the more natural long-term default
- the current code is deeply PostgreSQL-coupled, so this pass does not fake a half-migration
- Go owns persistence; the Astro frontend is an operator surface, not the system of record
- keep data relational and local-first
- keep plain SQL unless backend complexity later earns `sqlc`
- do not pivot to MongoDB

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
              ┌──────────▼───┐ ┌───▼──────────┐
              │ internal/git │ │ internal/db  │
              │ git CLI      │ │ pgx/plain SQL│
              └──────┬───────┘ └──────┬───────┘
                     │                │
              ┌──────▼──────┐   ┌────▼────────┐
              │ analytics + │   │ PostgreSQL  │
              │ sessions    │   │ event store │
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

Current PostgreSQL connection, embedded schema, plain SQL queries, and analytics persistence.

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
- `migrations/001_init.sql` for the repo-visible current PostgreSQL migration file

## Design constraints

- New backend implementation work belongs in Go.
- PostgreSQL is the only supported database target today because that is what the code implements right now.
- GitPulse does not presently earn PostgreSQL as a product default; SQLite is the likelier storage landing zone once a real migration happens.
- Keep persistence in Go; do not move schema ownership into the Astro lane unless the architecture materially changes and Drizzle becomes justified there.
- Keep data relational and local-first.
- Keep plain SQL unless backend complexity later earns `sqlc`.
- Do not introduce MongoDB.
- Astro owns the page/layout lane for the browser UI.
- Alpine handles light browser interaction; keep hydration modest.
- Keep repo-controlled strings treated as untrusted input.
- Document new runtime or release surfaces only when code for them exists.

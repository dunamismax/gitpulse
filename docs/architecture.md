# GitPulse Architecture

GitPulse is being rebuilt as a local-first Go application with PostgreSQL persistence and plain HTML templates.

The active stack is:

- Go for CLI, runtime, web server, git integration, analytics, and data access
- PostgreSQL for all persisted state
- Raw SQL via `pgx/v5`
- Plain HTML templates plus HTMX-style partial responses
- Existing CSS/JS assets reused where they still fit
- Zig/C reserved for future thin native shell work, not yet implemented in this repo

Legacy Rust/Tauri code remains in the repository only as a migration reference.

## System overview

```text
┌──────────────────────────────────────────────────────────┐
│                         surfaces                         │
│                  CLI + local web dashboard               │
└────────────────────────────┬─────────────────────────────┘
                             │
                     ┌───────▼────────┐
                     │ internal/runtime│
                     │ orchestration   │
                     └───┬─────────┬───┘
                         │         │
              ┌──────────▼───┐ ┌───▼──────────┐
              │ internal/git │ │ internal/db  │
              │ git CLI      │ │ pgx/raw SQL  │
              └──────┬───────┘ └──────┬───────┘
                     │                │
              ┌──────▼──────┐   ┌────▼────────┐
              │ analytics + │   │ PostgreSQL  │
              │ sessions    │   │ event store │
              └─────────────┘   └─────────────┘
```

## Package map

### `cmd/gitpulse`

Cobra CLI entrypoint. Owns command wiring only.

### `internal/config`

Platform path discovery and layered config loading via TOML + environment overrides.

### `internal/db`

Database connection, embedded schema, raw SQL queries, and analytics persistence.

### `internal/filter`

Include/exclude glob logic for path filtering.

### `internal/git`

Git subprocess execution, repo discovery, snapshot parsing, and history import parsing.

### `internal/metrics`

Pure-ish score, streak, and achievement logic.

### `internal/models`

Shared data structures passed between runtime, DB, and web layers.

### `internal/runtime`

Application orchestration: add repo, refresh, import history, rebuild analytics, and assemble view models.

### `internal/sessions`

Sessionization logic over activity points.

### `internal/web`

`net/http` handlers, partial endpoints, and template rendering.

## Data flow

1. A repo or folder is added through the CLI or web form.
2. `internal/git` discovers git roots and probes repo metadata.
3. `internal/db` persists tracked targets, repositories, snapshots, commits, push events, file activity, sessions, rollups, and achievements.
4. `internal/runtime` rebuilds derived analytics from raw events.
5. `internal/web` renders dashboard, repository, sessions, achievements, and settings views from runtime view models.

## Persistence model

Current Go rewrite tables:

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

- `internal/db/schema.sql` for the embedded startup migration path
- `migrations/001_init.sql` for explicit repo-visible schema history

## Migration stance

- New implementation work belongs in Go.
- PostgreSQL is the only supported database target for the rewrite.
- No ORM layer should be introduced.
- Legacy Rust files may be consulted for parity, then removed once the Go path fully replaces them.

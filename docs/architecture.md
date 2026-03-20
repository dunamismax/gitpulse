# GitPulse Architecture

GitPulse is structured as a Rust-first local analytics system with a thin HTML/HTMX presentation layer.

## Flow

1. A repo root or parent folder is added through the CLI or UI.
2. The runtime discovers repos and persists them in SQLite.
3. Initial history import pulls recent commit metadata through the git CLI.
4. A debounced watcher plus periodic polling enqueue repo refresh work.
5. Refreshes call the git adapter for canonical snapshots:
   - branch/head/upstream state
   - ahead/behind counts
   - live and staged numstat diffs
   - untracked text file additions
   - periodic tokei language snapshots
6. The runtime writes snapshots, file activity events, commits, and pushes to the event ledger tables.
7. Rollup rebuilds convert event history into:
   - focus sessions
   - daily rollups
   - streaks
   - score
   - achievements
8. Axum + Askama pages and HTMX partials read the resulting analytics for dashboard and drill-down views.

## Crate Boundaries

### `gitpulse-core`

- Pure logic and shared types
- No Axum/Tauri/SQLx concerns
- Holds score, streak, session, and timezone/day-boundary rules

### `gitpulse-infra`

- All external integration boundaries
- SQLx/SQLite
- git CLI parsing
- repo discovery
- exclusion matching
- notify-based filesystem watching
- optional GitHub verification

### `gitpulse-runtime`

- Application orchestration
- Coordinates adds/imports/refreshes
- Validates and persists repo-specific pattern overrides
- Detects pushes from state transitions
- Rebuilds analytics from ledger data
- Exposes high-level queries for the UI and CLI

### `gitpulse-web`

- Axum routes and handlers
- Askama templates
- HTMX partial endpoints
- Repository detail forms for repo-specific pattern overrides
- SVG chart rendering and static assets

### CLI and Desktop Apps

- `gitpulse-cli` is the headless entrypoint
- `gitpulse-desktop` is intentionally thin and reuses the exact same runtime/web stack

## Persistence Strategy

SQLite stores append-friendly event data plus rebuildable daily analytics:

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

The app keeps raw events separate from rollups and separate again from gamified score so recalculation stays possible.

## Why Git CLI Instead Of Libgit2

- Simpler availability on developer machines
- Easier alignment with what users see in their normal git workflows
- Safer incremental parsing for a local-first v1

## Desktop And Web Reuse

There is one product implementation:

- same runtime
- same database
- same routes
- same templates
- same assets

The Tauri shell only starts the runtime on localhost and adds a native folder picker bridge.

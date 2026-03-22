# GitPulse Architecture

GitPulse is structured as a Rust-first local analytics system with a thin HTML/HTMX presentation layer and a clean crate hierarchy that supports future extension.

## System overview

```
┌─────────────────────────────────────────────────────────┐
│                    Product surfaces                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   CLI    │  │  Web (Axum)  │  │ Desktop (Tauri v2) │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
│       │               │                   │              │
│       └───────────────┼───────────────────┘              │
│                       │                                  │
│              ┌────────┴────────┐                         │
│              │ gitpulse-runtime │  ← orchestration       │
│              └───┬─────────┬───┘                         │
│                  │         │                             │
│         ┌────────┴──┐  ┌───┴──────────┐                  │
│         │   core    │  │    infra     │  ← domain + I/O  │
│         └───────────┘  └──────┬───────┘                  │
│                               │                          │
│                        ┌──────┴──────┐                   │
│                        │   SQLite    │                   │
│                        └─────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Data flow

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

## Analytics rebuild strategy

- Sessions, daily rollups, and achievements are still rebuilt from the full local snapshot/event history for v1.
- The explicit `gitpulse rebuild-rollups` maintenance path reports scanned row counts, derived output counts, and elapsed time so rebuild cost is operator-visible.
- This keeps the raw-event versus derived-rollup split inspectable while deferring incremental/scoped rebuild complexity until measured operator pain justifies it.

## Crate boundaries

### `gitpulse-core`

- Pure logic and shared types
- No Axum/Tauri/SQLx concerns
- Holds score, streak, session, and timezone/day-boundary rules
- Achievement definitions and evaluation logic
- Settings and configuration types

### `gitpulse-infra`

- All external integration boundaries
- SQLx/SQLite persistence and migrations
- Layered config loading (defaults -> TOML -> env vars -> CLI)
- App directory discovery (platform-aware XDG/macOS/Windows)
- Git CLI parsing and command execution
- Repo discovery and path normalization
- Exclusion pattern matching (global + repo-specific, exclude-wins)
- notify-based filesystem watching with debouncing
- Optional GitHub API verification

### `gitpulse-runtime`

- Application orchestration
- Coordinates adds/imports/refreshes
- Validates and persists repo-specific pattern overrides
- Detects pushes from state transitions
- Rebuilds analytics from ledger data
- Exposes high-level queries for the UI and CLI

### `gitpulse-web`

- Axum routes and handlers
- Askama templates with HTMX partials
- Repository detail forms for repo-specific pattern overrides
- Server-side SVG chart rendering (trends, heatmaps, language/file breakdowns)
- Static asset serving with compression

### CLI and desktop apps

- `gitpulse-cli` is the headless entrypoint
- `gitpulse-desktop` is intentionally thin and reuses the exact same runtime/web stack

## Persistence strategy

SQLite stores append-friendly event data plus rebuildable daily analytics:

| Table | Purpose | Append or derived |
|-------|---------|-------------------|
| `tracked_targets` | Repo roots and folders being monitored | Append |
| `repositories` | Individual git repos with config | Append |
| `repo_status_snapshots` | Point-in-time branch/diff state | Append |
| `file_activity_events` | Per-file line change events | Append |
| `commit_events` | Imported commit metadata | Append (idempotent) |
| `push_events` | Detected/confirmed pushes | Append |
| `focus_sessions` | Sessionized work periods | Derived |
| `daily_rollups` | Aggregated daily metrics | Derived |
| `achievements` | Unlocked badges | Derived |
| `settings` | User configuration | Append |

The app keeps raw events separate from rollups and separate again from gamified score so recalculation stays possible.

## Why git CLI instead of libgit2

- Simpler availability on developer machines
- Easier alignment with what users see in their normal git workflows
- Safer incremental parsing for a local-first v1
- Avoids linking complexity and platform-specific build issues

## Desktop and web reuse

There is one product implementation:

- same runtime
- same database
- same routes
- same templates
- same assets

The Tauri shell only starts the runtime on localhost and adds a native folder picker bridge.

## Future architecture considerations

### REST API layer (Phase 10)

The API will sit alongside the web routes in `gitpulse-web` or in a new `gitpulse-api` crate, consuming the same `gitpulse-runtime` queries. The web dashboard may eventually be refactored to consume the API internally, but for v1 the server-side rendering approach stays.

### Plugin system (Phase 11)

Plugins will communicate with the host via JSON-RPC over stdin/stdout (process isolation). The plugin boundary sits between `gitpulse-runtime` (which provides the query/event interface) and the plugin process. Plugins cannot access `gitpulse-infra` or `gitpulse-core` directly. See [plugin-architecture.md](plugin-architecture.md) for the full design.

### Sync layer (Phase 15)

If multi-device sync is added, it will operate at the event level — syncing raw events between devices and rebuilding derived analytics locally. This preserves the local-first model and avoids syncing derived state that could diverge. The sync layer would sit alongside `gitpulse-infra` as a new boundary crate.

### Scaling considerations

- The current full-history rebuild is O(events). For v1 datasets (months of history, <50 repos), this is fine.
- If rebuild time becomes a problem, the likely solution is incremental rebuilds scoped to changed date ranges, not a fundamentally different architecture.
- The event/rollup split was designed to support this transition — rollups can be rebuilt for specific date ranges without replaying all history.

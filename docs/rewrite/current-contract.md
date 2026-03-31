# Current Shipped Contract

This document freezes the current shipped GitPulse contract that the rewrite has to match before cutover. It is grounded in:

- `README.md`
- `docs/architecture.md`
- `docs/operator-workflow.md`
- `docs/frontend-parity-matrix.md`
- `cmd/gitpulse/main.go`
- `cmd/gitpulse/tui.go`
- `cmd/gitpulse/web_dist.go`
- `internal/config/config.go`
- `internal/config/persist.go`
- `internal/models/contracts.go`
- `internal/models/models.go`
- `internal/runtime/runtime.go`
- `internal/web/server.go`
- `internal/web/static_ui.go`
- `internal/web/handlers_api.go`
- `internal/db/schema.sql`
- `migrations/0001_init.sql`
- `gitpulse.example.toml`

## Shipped Summary

- The shipped product is a Go CLI plus local web dashboard.
- SQLite is the active database and the Go runtime is the system of record.
- The browser UI is a built Astro + Vue app under `frontend/web/`, served directly by `gitpulse serve`.
- The supported operator loop is still manual-first: add, import, rescan, rebuild, inspect.
- The source-run terminal preview under `frontend/tui/` exists today, but it is a secondary surface.

## CLI Contract

All repo-defined commands share one persistent flag:

- `--config string`: optional config file path. When empty, GitPulse resolves the platform config file path.

| Command | Inputs and defaults | Current shipped behavior |
| --- | --- | --- |
| `gitpulse serve` | `--host`, `--port`; fall back to `server.host` and `server.port`; built UI lookup can be overridden with `GITPULSE_WEB_DIST_DIR` | Starts one Go HTTP server that serves the JSON API and the built browser UI on one origin. Requires a built `frontend/web/dist` or an explicit dist override. |
| `gitpulse tui` | `--api-base-url`, `--screen`, `--repo`, `--once`; falls back to `GITPULSE_API_BASE_URL`, then to `server.host` and `server.port` | Launches the source-run Bun TUI preview against a live API. Requires `bun` on `PATH` and a discoverable `frontend/` workspace. |
| `gitpulse add <path>` | one required path argument; repo discovery depth defaults to `monitoring.repo_discovery_depth=5` | Resolves the path, discovers one or more git roots, writes tracked target and repository rows, and stops. It does not import history, rescan, or rebuild analytics. |
| `gitpulse rescan` | `--all`, `--repo`; empty selector behaves like all | Refreshes live git state. Global rescan skips repositories that are not `active` or not monitored. It does not import commits or rebuild analytics. |
| `gitpulse import` | `--days`, `--all`, `--repo`; `--days=0` falls back to `monitoring.import_days=30`; empty selector behaves like all | Imports commit history from `git log` and writes import-side file activity. Global import skips only repositories already marked `removed`; disabled repositories are still processed. Duplicate commits are ignored on `(repo_id, commit_sha)`. |
| `gitpulse rebuild-rollups` | no command-specific flags | Recomputes sessions, rollups, and achievements from stored snapshots, commits, pushes, and file activity. It does not trigger add, import, or rescan. |
| `gitpulse doctor` | no command-specific flags | Best-effort diagnostics: git version, config/data paths, database path, and tracked repositories. Runtime errors are printed but do not force a non-zero exit. |

Other CLI facts that matter for parity:

- Runtime-backed commands load config, open SQLite, and run the embedded schema idempotently before executing work.
- `--repo` selectors resolve in this order: UUID string, exact repository name, exact `root_path`, then `root_path LIKE selector%`.
- Path filtering prefers repo-level include and exclude patterns. If a repo has no saved patterns, GitPulse falls back to config patterns, then to the built-in default exclude list.

## Browser and API Contract

### Same-origin serving

Current shipped browser routing is same-origin through the Go server:

- `gitpulse serve` defaults to `http://127.0.0.1:7467`.
- `/api/*` is handled in Go.
- Browser routes are served from the built Astro output under `frontend/web/dist`.
- Static assets are served directly from the same `dist` directory.

Current shell routes:

| Browser path | Served shell |
| --- | --- |
| `/` | `index.html` |
| `/repositories` | `repositories/index.html` |
| `/repositories/{anything-but-exactly-/repositories}` | `repositories/detail/index.html` |
| `/sessions` | `sessions/index.html` |
| `/achievements` | `achievements/index.html` |
| `/settings` | `settings/index.html` |

### JSON envelope rules

- Successful API responses are wrapped as `{"data": ...}`.
- Error responses are `{"error": "..."}`.
- Action endpoints return `{"data":{"result": ...}}` plus optional `repositories`, `repository`, `repository_card`, or `settings`.
- No current API handler reads query parameters; the contract is path params plus JSON bodies only.

### Read routes

| Route | Response contract | Current notes |
| --- | --- | --- |
| `GET /api/dashboard` | `DashboardResponse` -> `DashboardView` | Includes summary, activity feed, trend points, heatmap days, and repo cards. |
| `GET /api/repositories` | `RepositoriesResponse` -> `RepositoriesPayload` | Returns `repositories` as an explicit collection payload, not a bare array. Removed repositories are filtered out of the cards view. |
| `GET /api/repositories/{id}` | `RepoDetailResponse` -> `RepoDetailView` | Route token is named `{id}`, but the lookup accepts UUID string, exact name, exact path, or path prefix. |
| `GET /api/sessions` | `SessionsResponse` -> `SessionSummary` | Read-only sessions view with aggregate totals and recent sessions. |
| `GET /api/achievements` | `AchievementsResponse` -> `AchievementsView` | Combines achievements, streaks, and current score in one payload. |
| `GET /api/settings` | `SettingsResponse` -> `SettingsView` | Returns the full runtime config plus resolved config and data paths. |

### Action routes

| Route | Request body | Action id | Current notes |
| --- | --- | --- | --- |
| `POST /api/repositories/add` | `{"path": string}` | `add_target` | Trims and requires `path`, discovers git roots, and returns all repositories registered from that target. |
| `POST /api/repositories/{id}/refresh` | none | `refresh_repo` | `{id}` must be a UUID. Writes a new snapshot, refresh-side file activity, and maybe a local push detection. Returns a `repository_card` when available. |
| `POST /api/repositories/{id}/toggle` | none | `toggle_repo` | `{id}` must be a UUID. Flips `active/monitored=true` to `disabled/monitored=false`, or back again. |
| `POST /api/repositories/{id}/remove` | none | `remove_repo` | `{id}` must be a UUID. Soft-removes the repository by state change. History and snapshots remain in the database. |
| `POST /api/repositories/{id}/patterns` | `{"include_patterns":[],"exclude_patterns":[]}` | `save_repo_patterns` | `{id}` must be a UUID. Saves per-repo path filters. |
| `POST /api/repositories/{id}/import` | optional `{"days": number}` | `import_repo` | `{id}` must be a UUID and the repository must exist. Empty body or `days < 1` falls back to `monitoring.import_days`. |
| `POST /api/actions/import` | optional `{"days": number}` | `import_all` | Processes every repository except those already marked `removed`. Per-repo failures become warnings instead of aborting the whole action. |
| `POST /api/actions/rescan` | none | `rescan_all` | Processes only repositories with `state=active` and `is_monitored=true`. Per-repo failures become warnings. |
| `POST /api/actions/rebuild` | none | `rebuild_analytics` | Recomputes sessions, rollups, and achievements and returns the written counts in `result.lines`. |
| `POST /api/settings` | flat body with authors, goals, timezone, day boundary, session gap, import days, default patterns, GitHub flags, and token | `save_settings` | Writes the active TOML config file atomically, updates in-memory runtime config, and returns the updated `settings` payload. It does not accept `database.path`, `server.host`, `server.port`, or `monitoring.repo_discovery_depth`. |

Settings edge cases that matter:

- Blank `timezone` becomes `UTC`.
- `session_gap_minutes` and `import_days` must be at least `1`.
- `github_token` only overwrites the stored token when the new value is non-empty. The current API has no way to clear a saved token by sending an empty string.

## Config Surface

Environment overrides use `GITPULSE_SECTION__KEY`, for example `GITPULSE_DATABASE__PATH` or `GITPULSE_SERVER__PORT`.

Current shipped config inventory:

| Section and keys | Default | Writable through `POST /api/settings`? | Current notes |
| --- | --- | --- | --- |
| `database.path` | platform data dir + `gitpulse.db` | no | Current runtime owns a single SQLite path only. |
| `server.host`, `server.port` | `127.0.0.1`, `7467` | no | Used by `gitpulse serve` and by `gitpulse tui` fallback URL derivation. |
| `goals.changed_lines_per_day`, `goals.commits_per_day`, `goals.focus_minutes_per_day` | `250`, `3`, `90` | yes | Feed dashboard goal progress and score framing. |
| `monitoring.import_days`, `monitoring.session_gap_minutes`, `monitoring.repo_discovery_depth` | `30`, `15`, `5` | only first two | `repo_discovery_depth` matters to `add`; it is not currently editable from the settings page. |
| `ui.timezone`, `ui.day_boundary_minutes` | `UTC`, `0` | yes | Affect rollup day bucketing and streak logic. |
| `github.enabled`, `github.verify_remote_pushes`, `github.token` | `false`, `false`, unset | yes | `verify_remote_pushes` is exposed in config and UI, but no current backend path uses it to write `push_remote_confirmed` rows. |
| `patterns.include`, `patterns.exclude` | `[]`, built-in exclude list | yes | Copied into new repository rows on add, but existing repo rows keep their stored pattern snapshot until explicitly updated. |
| `authors[]` (`email`, `name`, `aliases`) | empty slice | yes, but email-only via settings API | Empty authors means "accept all authors" during history import. |

Current non-section env and runtime knobs:

- `GITPULSE_WEB_DIST_DIR`: override built web dist discovery for `gitpulse serve`.
- `GITPULSE_API_BASE_URL`: override API origin for `gitpulse tui` and the shared frontend client.

## SQLite Schema Inventory

Current schema and migration file are aligned byte-for-byte across:

- `internal/db/schema.sql`
- `migrations/0001_init.sql`

Timestamps are stored as RFC3339 UTC text. JSON payloads are stored as text.

| Table | Current role | Current write path | Canonical or derived | Notes that matter for migration |
| --- | --- | --- | --- | --- |
| `tracked_targets` | user-added repo or folder roots | `add` | canonical | `kind` is `repo` or `folder`. Paths are absolute host paths. |
| `repositories` | tracked repository registry | `add`, `toggle`, `remove`, `save_repo_patterns` | canonical | `include_patterns` and `exclude_patterns` are JSON text arrays. `state` is `active`, `disabled`, or `removed`. |
| `repo_status_snapshots` | point-in-time live git state | `refresh_repo`, `rescan_all` | canonical snapshot ledger | Stores ahead/behind counts, live and staged diff totals, repo size, and language breakdown JSON. |
| `file_activity_events` | file-level activity ledger | `refresh_repo`, `rescan_all`, `import_repo`, `import_all` | canonical event ledger | Schema allows `refresh`, `import`, `commit`, `push`, and `manual_rescan`, but current Go writes only `refresh` and `import` rows. |
| `commit_events` | imported commit ledger | `import_repo`, `import_all` | canonical event ledger | Unique on `(repo_id, commit_sha)`. Commit inserts are idempotent; file activity imported alongside commits is not deduplicated by the database. |
| `push_events` | local and remote push ledger | `refresh_repo`, `rescan_all` | canonical event ledger | Schema allows `push_detected_local` and `push_remote_confirmed`, but current Go writes only `push_detected_local`. |
| `focus_sessions` | inferred contiguous work sessions | `rebuild-rollups` | derived | Fully replaced on rebuild. `repo_ids` is a JSON text array of UUID strings. |
| `daily_rollups` | per-day aggregates | `rebuild-rollups` | derived | Fully replaced on rebuild. `scope` is either a repo UUID string or the literal `all`. `day` is a derived `YYYY-MM-DD` string. |
| `achievements` | unlocked achievements | `rebuild-rollups` | derived | Fully replaced on rebuild. Current kinds come from the Go constants in `internal/models/models.go`. |
| `settings` | generic key/value JSON store in schema only | no active Go write path found | currently non-authoritative | Current settings persistence is TOML file plus env overrides, not this table. |

## Manual Operator Workflow

Current shipped workflow and state effects:

| Step | User action | Writes | Does not do |
| --- | --- | --- | --- |
| 1 | build frontend and run `gitpulse serve` | no domain data writes | does not auto-scan or auto-import |
| 2 | add a repo or parent folder | `tracked_targets`, `repositories` | does not import history, rescan, or rebuild |
| 3 | import history | `commit_events`, `file_activity_events` with kind `import` | does not write snapshots or rebuild analytics |
| 4 | rescan working trees | `repo_status_snapshots`, `file_activity_events` with kind `refresh`, maybe `push_events` | does not import commits or rebuild analytics |
| 5 | rebuild analytics | replaces `focus_sessions`, `daily_rollups`, `achievements` | does not modify raw ledgers |
| 6 | save settings | active TOML config file and in-memory runtime config | does not write `settings` rows in SQLite |
| 7 | inspect results | no data writes required | does not auto-run more actions |

## Parity-critical Behaviors

The rewrite should preserve these behaviors unless a later phase explicitly changes them:

- The operator loop stays manual-first. Add, import, rescan, and rebuild remain separate actions with visible results.
- Live work, commit history, and push history stay as separate ledgers. They are not collapsed into one synthetic activity table.
- The browser speaks to one origin in shipped mode. Today that origin is the Go server; vNext must preserve the same one-origin model through Caddy.
- Add only registers targets and repositories. It does not silently pull history or rebuild derived data.
- Global rescan skips disabled and removed repositories. Global import skips removed repositories but still processes disabled ones. Rebuild excludes removed repositories but still includes disabled ones.
- Remove is a soft state change, not a hard delete. Existing repository history remains in the data store after removal.
- Settings writes are file-backed today. The rewrite cannot assume the SQLite `settings` table is the authoritative source for current users.
- Current settings save cannot clear a saved GitHub token by sending an empty string.
- Per-repo include and exclude patterns are part of persisted repository state. New repositories inherit the current global defaults at add time, but later global config changes do not retroactively rewrite existing repo rows.
- Derived tables are rebuildable and replaceable. Cutover must preserve the raw ledgers that feed them before trusting any migrated derived rows.
- First-run and empty-state guidance in the shipped web UI is explicit about the manual loop: add, import, rescan, rebuild, inspect.

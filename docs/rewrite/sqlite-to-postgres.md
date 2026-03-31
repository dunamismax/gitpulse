# SQLite to PostgreSQL Migration Plan

This document defines the first credible SQLite-to-PostgreSQL migration plan for the rewrite. It is specific about what gets copied, what gets rebuilt, and which current files are authoritative.

## Migration Principles

- Preserve repository identity, event identity, and repository paths verbatim on first import.
- Preserve the raw ledgers before trusting any rebuilt or derived tables.
- Rebuild sessions, rollups, and achievements from imported canonical ledgers instead of treating the current SQLite derived tables as authoritative.
- Treat the active TOML config plus env overrides as the authoritative settings source for current users. The SQLite `settings` table is not authoritative today.
- Do not add a Go/SQLite to Bun/PostgreSQL dual-write phase.

## Type Translation Rules

| SQLite shape today | PostgreSQL shape for vNext | Notes |
| --- | --- | --- |
| `TEXT` UUID columns | `uuid` | Preserve current UUID values as-is. |
| RFC3339 UTC timestamp text | `timestamptz` | Parse in UTC and keep UTC semantics on write. Preserve column names with `_utc` suffix in the first PostgreSQL schema to reduce churn. |
| JSON text arrays or objects | `jsonb` | Applies to include/exclude patterns, language breakdown, session repo IDs, and any legacy `settings.value_json`. |
| integer booleans (`0`/`1`) | `boolean` | Applies to `is_monitored`, `is_detached`, `is_merge`, and any later boolean carryover. |
| integer counters | `integer` | Keep current metric counts and diff totals as integers. |
| repo size bytes | `bigint` | Preserve `repo_size_bytes` as `bigint`. |
| enum-like text with SQLite `CHECK` | `text` plus PostgreSQL `CHECK` | Keep string values stable; do not introduce PostgreSQL enum types in the first cut. |
| `day` stored as `YYYY-MM-DD` text | `date` | Preserve the current day string semantics but store it as `date` in PostgreSQL. |

## Canonical Tables to Copy Directly

These tables are authoritative inputs and should be imported row-for-row into PostgreSQL.

| Table | PostgreSQL columns | Import notes |
| --- | --- | --- |
| `tracked_targets` | `id uuid pk; path text unique; kind text check(kind in ('repo','folder')); created_at_utc timestamptz; last_scan_at_utc timestamptz null` | Preserve absolute host paths exactly. First cutover depends on identity bind mounts so those paths stay valid inside the API container. |
| `repositories` | `id uuid pk; target_id uuid null fk tracked_targets(id); name text; root_path text unique; remote_url text null; default_branch text null; include_patterns jsonb not null; exclude_patterns jsonb not null; is_monitored boolean not null; state text check(state in ('active','disabled','removed')); created_at_utc timestamptz; updated_at_utc timestamptz; last_error text null` | Preserve stored per-repo patterns exactly. Do not recompute them from the current global config during import. |
| `repo_status_snapshots` | `id uuid pk; repo_id uuid fk repositories(id); observed_at_utc timestamptz; branch text null; is_detached boolean not null; head_sha text null; upstream_ref text null; upstream_head_sha text null; ahead_count integer not null; behind_count integer not null; live_additions integer not null; live_deletions integer not null; live_files integer not null; staged_additions integer not null; staged_deletions integer not null; staged_files integer not null; files_touched integer not null; repo_size_bytes bigint not null; language_breakdown jsonb not null` | Copy full history. Do not collapse to latest snapshot only. Current rebuild logic relies on historical snapshot rows. |
| `file_activity_events` | `id uuid pk; repo_id uuid fk repositories(id); observed_at_utc timestamptz; relative_path text; additions integer not null; deletions integer not null; kind text check(kind in ('refresh','import','commit','push','manual_rescan'))` | Preserve all rows and kinds exactly, even if current Go only writes `refresh` and `import`. Do not deduplicate or merge repeated rows during import. |
| `commit_events` | `id uuid pk; repo_id uuid fk repositories(id); commit_sha text; authored_at_utc timestamptz; author_name text null; author_email text null; summary text; branch text null; additions integer not null; deletions integer not null; files_changed integer not null; is_merge boolean not null; imported_at_utc timestamptz; unique(repo_id, commit_sha)` | Preserve current UUID row ids and the uniqueness rule on `(repo_id, commit_sha)`. |
| `push_events` | `id uuid pk; repo_id uuid fk repositories(id); observed_at_utc timestamptz; kind text check(kind in ('push_detected_local','push_remote_confirmed')); head_sha text null; pushed_commit_count integer not null; upstream_ref text null; notes text null` | Preserve string kinds without coercion. Current Go only writes local detections, but importer must not reject confirmed rows if a legacy DB has them. |

## Tables to Rebuild After Import

These tables are derived from the canonical ledgers above. The first trustworthy vNext state comes from rebuilding them after import.

| Table | PostgreSQL columns | Import action |
| --- | --- | --- |
| `focus_sessions` | `id uuid pk; started_at_utc timestamptz; ended_at_utc timestamptz; active_minutes integer not null; repo_ids jsonb not null; event_count integer not null; total_changed_lines integer not null` | Do not treat SQLite rows as authoritative. Recompute from imported commit and file activity events using the rewrite runtime. Export legacy SQLite rows separately for parity comparison if needed. |
| `daily_rollups` | `scope text; day date; live_additions integer not null; live_deletions integer not null; staged_additions integer not null; staged_deletions integer not null; committed_additions integer not null; committed_deletions integer not null; commits integer not null; pushes integer not null; focus_minutes integer not null; files_touched integer not null; languages_touched integer not null; score integer not null; primary key(scope, day)` | Rebuild after importing canonical ledgers and recomputing sessions. Keep the current `scope='all' or repo UUID string` contract in the first cut. |
| `achievements` | `kind text pk; unlocked_at_utc timestamptz; day date null; reason text not null` | Recompute after rollups and sessions are rebuilt. Preserve current string achievement kinds. |

## Settings Inputs

Settings migration needs explicit honesty because current sources are split:

| Source today | First-cut PostgreSQL plan | Why |
| --- | --- | --- |
| active TOML config file plus env overrides | authoritative input to the rewrite config loader | Current settings UI writes TOML atomically and updates runtime memory; this is what users actually edit today. |
| SQLite `settings` table | optional legacy rows copied into `settings(key text pk, value_json jsonb, updated_at_utc timestamptz)` only if present | The schema table exists, but the shipped Go runtime does not use it for settings save or read paths. It cannot be the only migration source. |

Implication:

- The importer needs two inputs for current users: the SQLite database and the active config file path.
- An empty SQLite `settings` table must not cause the importer to discard real user settings that live in TOML today.

## Ledger Preservation Rules

- Preserve every row id in `tracked_targets`, `repositories`, `repo_status_snapshots`, `file_activity_events`, `commit_events`, and `push_events`.
- Preserve repository paths exactly on first import.
- Preserve repo pattern JSON exactly instead of re-deriving it from current config.
- Preserve push event kinds exactly.
- Preserve file activity rows exactly, including repeated historical imports or rescans.
- Rebuild derived tables only after canonical import is complete.

## Import Order

1. Resolve the active TOML config file and effective env overrides.
2. Open the SQLite database read-only and confirm schema compatibility.
3. Create an empty PostgreSQL schema with the first-cut tables above.
4. Import `tracked_targets`.
5. Import `repositories`.
6. Import `repo_status_snapshots`.
7. Import `file_activity_events`.
8. Import `commit_events`.
9. Import `push_events`.
10. Import any legacy `settings` rows if they exist, without letting them override TOML-owned settings.
11. Run the vNext rebuild to regenerate `focus_sessions`, `daily_rollups`, and `achievements`.
12. Run parity checks against exported Go baselines before cutover.

## Explicit First-cut Non-goals

- no path remapping manifest in the first cut; first cutover depends on identity repo mounts
- no schema normalization pass that renames current tables or columns just because PostgreSQL makes it possible
- no PG enum types in the first cut
- no import-time attempt to "fix" duplicated historical file activity rows
- no assumption that the SQLite `settings` table is complete or current

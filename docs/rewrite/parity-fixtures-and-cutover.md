# Deterministic Parity Fixtures and Cutover

This document defines the minimum deterministic fixtures and the cutover checklist needed to call the rewrite credible. These fixtures do not exist in the repo yet; this file defines exactly what later phases have to build and compare.

## Fixture Rules

- Use fixed UTC commit timestamps, not relative dates.
- Set fixture config to `ui.timezone=UTC` and `ui.day_boundary_minutes=0`.
- Use an import window large enough to include all fixed commit dates, for example `days=3650`.
- Capture parity from both API responses and direct database counts.
- Run the Go app and the rewrite against the same fixture repositories.

## Fixture Repositories

| Fixture repo | Shape | Deterministic contents | Purpose |
| --- | --- | --- | --- |
| `alpha` | single repo, no upstream | commit `2026-01-10T09:00:00Z` creates `main.go`; commit `2026-01-11T10:15:00Z` adds `README.md`; after import, leave one uncommitted README change | baseline add/import/rescan/rebuild flow, no-upstream health state, non-empty sessions and achievements after rebuild |
| `bravo` | nested repo under a parent folder | commit `2026-01-12T14:00:00Z` creates `src/app.ts`; clean working tree after import | folder discovery and multi-repo inventory ordering |
| `delta` | repo with a local bare remote | commit `2026-01-13T09:00:00Z` ahead of local bare `origin/main`, rescan once while ahead, push to bare remote, rescan again after push | deterministic `push_detected_local` coverage and recent push visibility |

Phase 0 decision for fixture paths:

- Build these repos under one parent folder so the same folder can exercise `tracked_targets.kind='folder'`.
- Preserve stable absolute paths across the Go app and the rewrite runtime.

## Database Fixture States

| Fixture DB state | How it is produced | Required assertions |
| --- | --- | --- |
| `fresh` | empty config and empty database | all read endpoints return valid envelopes; repositories, sessions, achievements, and repo cards are empty; settings return defaults and discovered paths |
| `manual-loop` | add `alpha`, import `days=3650`, rescan, rebuild | one tracked repo; imported commits visible in repo detail; at least one snapshot row; file activity rows present; sessions, daily rollups, and achievements populated |
| `folder-discovery` | add the parent folder containing `alpha` and `bravo` | one `tracked_targets` row with `kind='folder'`; two repositories registered; repositories list and dashboard cards are stable and ordered |
| `push-detection` | add `delta`, rescan while ahead, push, rescan again, rebuild | one `push_events` row with `kind='push_detected_local'`; dashboard and repo detail expose recent push data |
| `state-transitions` | start from `manual-loop`, toggle disabled, run global rescan, toggle active, remove repo, run global import and rebuild | disabled repo skipped by global rescan; removed repo excluded from global import and rebuild; soft-removed history remains queryable in the database |

## Required Parity Assertions

These checks must pass for the Go app and the rewrite before cutover:

- `GET /api/dashboard` agrees on repo-card count and today-summary shape.
- `GET /api/repositories` agrees on repository count, state values, and path/pattern fields.
- `GET /api/repositories/{id}` agrees on repo identity, recent commits, recent pushes, recent sessions, language breakdown, and top-files population rules.
- `GET /api/sessions` agrees on total minutes, average length, longest session, and session count.
- `GET /api/achievements` agrees on unlocked achievement kinds, streak summary shape, and today score.
- `GET /api/settings` agrees on effective config plus discovered paths for the active runtime.
- Action responses preserve the stable action ids already shipped today: `add_target`, `refresh_repo`, `toggle_repo`, `remove_repo`, `save_repo_patterns`, `import_repo`, `import_all`, `rescan_all`, `rebuild_analytics`, and `save_settings`.

Database-side parity checks that must also pass:

- `tracked_targets`, `repositories`, `repo_status_snapshots`, `file_activity_events`, `commit_events`, and `push_events` row counts match after import.
- Imported repository ids and root paths match exactly.
- Commit uniqueness on `(repo_id, commit_sha)` survives import.
- Rebuilt `focus_sessions`, `daily_rollups`, and `achievements` match the Go baseline for fixture databases after the rewrite runs its rebuild.

## Cutover Checklist

1. Freeze Go baselines for every fixture database and API response before importing anything.
2. Verify identity repo mounts for every tracked absolute path that will be used inside the API container.
3. Start the vNext Compose stack with empty PostgreSQL storage and Caddy on `127.0.0.1:7467`.
4. Import canonical SQLite tables into PostgreSQL using the table rules in `docs/rewrite/sqlite-to-postgres.md`.
5. Load the active TOML config and effective env overrides into the rewrite runtime.
6. Run the rewrite rebuild so sessions, rollups, and achievements are regenerated from imported ledgers.
7. Compare rewrite results with the frozen Go baselines for all fixture states.
8. Re-run the manual operator loop against live fixture repos through the rewrite API: add, import, rescan, rebuild, inspect, settings save.
9. Verify browser traffic stays same-origin through Caddy and does not rely on a direct browser-to-API base URL.
10. Only after parity passes should docs switch the default quick start away from the Go runtime.

## Explicit Non-goals

- no TUI parity requirement for first cutover
- no background watcher or poller in first cutover
- no packaged desktop release work in first cutover
- no dual-write bridge between the Go app and the rewrite
- no path remapping feature beyond identity mounts in first cutover
- no contract expansion beyond the shipped dashboard, repositories, repository detail, sessions, achievements, settings, and explicit operator actions

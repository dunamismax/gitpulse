# BUILD.md

> This is the primary operational handoff document for this repository.
> It is a living document. Every future agent or developer who touches this project is responsible for keeping it accurate, current, and up to date.
> If code, tooling, workflows, risks, or verified commands change, update this file in the same pass.

## Verification Snapshot

- Last reviewed directly in the repo on `2026-03-20`.
- Host used for verification: macOS in `/Users/sawyer/github/gitpulse`.
- Primary branch: `main`.
- Observed toolchain during verification: `cargo 1.94.0`, `rustc 1.94.0`, `git 2.50.1`, `sqlite3 3.51.0`.

## 1. Project Baseline

GitPulse is a local-first Rust workspace that tracks activity across one or many git repositories and renders the results in a server-rendered HTMX dashboard. It supports live and staged diff snapshots, imported commit history, local push detection, focus sessions, streaks, daily goals, score, achievements, and repo size/language snapshots.

### Major Components, Modules, and Entry Points

- `Cargo.toml`
  - Workspace root manifest and shared dependency/tooling configuration.
- `crates/gitpulse-core/src/`
  - Domain models, settings types, streak logic, achievement rules, score formula, sessionization, and timezone/day-boundary helpers.
- `crates/gitpulse-infra/src/config.rs`
  - Layered config loading from defaults, config file, and environment.
- `crates/gitpulse-infra/src/dirs.rs`
  - OS-specific config/data/log path discovery.
- `crates/gitpulse-infra/src/db.rs`
  - SQLite/SQLx bootstrap, migrations, and persistence methods.
- `crates/gitpulse-infra/src/git.rs`
  - git CLI integration for repo discovery, status snapshots, untracked-text counting, commit import, and size/language snapshots.
- `crates/gitpulse-infra/src/watcher.rs`
  - Debounced watcher bridge that enqueues repo refresh signals.
- `crates/gitpulse-runtime/src/lib.rs`
  - High-level app orchestration:
    - add target
    - import history
    - refresh repo
    - detect push
    - rebuild analytics
    - serve dashboard data to CLI/web consumers
- `crates/gitpulse-web/src/lib.rs`
  - Axum routes, partial endpoints, Askama templates, and SVG chart rendering.
- `apps/gitpulse-cli/src/main.rs`
  - Headless entrypoint for `serve`, `add`, `rescan`, `import`, and `doctor`.
- `apps/gitpulse-desktop/src/main.rs`
  - Tauri v2 desktop shell and folder picker bridge.
- `migrations/0001_init.sql`
  - Source of truth for tracked targets, repositories, snapshots, file activity, commits, pushes, sessions, rollups, achievements, and settings.
- `assets/css/app.css`
  - Shared UI styling.
- `assets/js/app.js`
  - Tiny desktop/web helper JS for the native folder picker bridge.
- `assets/js/htmx.min.js`
  - Vendored HTMX runtime.

### Current Implemented State

- Implemented:
  - Local web dashboard with Axum + Askama + HTMX
  - Dashboard, repositories, repo detail, sessions, achievements, and settings pages
  - Real-time-ish refresh via watcher signals plus periodic polling
  - Parent-folder repo discovery
  - Initial recent-history import for tracked repos
  - Working-tree and staged diff snapshotting
  - Untracked text-file line counting
  - Local push detection from ahead-count drops
  - Optional GitHub-based remote push confirmation
  - Daily rollups, sessions, streaks, score, goals, and achievements
  - Explicit `rebuild-rollups` CLI command for manual analytics rebuilds
  - Server-side SVG charts
  - Clap CLI
  - Tauri v2 shell scaffolded around the same runtime and web app
  - Per-repo include/exclude pattern editor on the repository detail page
  - CI, `cargo-deny`, and `cargo-nextest` config files
  - Integration tests for repo discovery, exclusions, commit import, push detection, and route smoke coverage
- Not implemented:
  - Team or cloud mode
  - Mobile client
  - Explicit history purge UI

## 2. Verified Build and Run Workflow

### Prerequisites and Environment Notes

- Rust stable toolchain
- git available on `PATH`
- SQLite available locally
- No external service is required for primary functionality
- GitHub verification is optional and only relevant if a token is configured

### Verified Commands

These commands were actually run successfully in this repository on `2026-03-20`.

| Purpose | Command | Result |
| --- | --- | --- |
| Headless workspace check | `cargo check --workspace --exclude gitpulse-desktop` | Passed |
| Test suite | `cargo test --workspace --exclude gitpulse-desktop` | Passed |
| Nextest suite | `cargo nextest run --workspace --exclude gitpulse-desktop` | Passed |
| Lint | `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings` | Passed |
| Manual analytics rebuild | `cargo run -p gitpulse-cli -- rebuild-rollups` | Passed |
| CLI diagnostics smoke test | `cargo run -p gitpulse-cli -- doctor` | Passed |

### Desktop Verification Note

- `apps/gitpulse-desktop/` is implemented and wired to the shared runtime/web stack.
- A full end-to-end desktop launch was not re-verified in this pass because the local `cargo check -p gitpulse-desktop` compile path entered a long-running rustc phase and was not allowed to complete to a clean finish during verification.
- Treat desktop support as present in code, but re-verify locally before release packaging.

## 3. Source-of-Truth Notes

### Authoritative Files and Directories

- `BUILD.md`
  - Primary operational handoff document.
- `AGENTS.md`
  - Concise repo memory for future agents.
- `README.md`
  - User-facing project overview and run instructions.
- `docs/architecture.md`
  - Product and crate boundary overview.
- `docs/metrics.md`
  - Metric semantics and caveats.
- `migrations/0001_init.sql`
  - Database schema source of truth.
- `crates/gitpulse-core/src/*`
  - Product rules and analytics math.
- `crates/gitpulse-infra/src/*`
  - External integration boundaries and persistence.
- `crates/gitpulse-runtime/src/lib.rs`
  - Runtime orchestration source of truth.
- `crates/gitpulse-web/src/lib.rs`
  - Routes and page composition source of truth.
- `crates/gitpulse-web/templates/*`
  - Presentational template source of truth.
- `assets/*`
  - Shared UI assets.

### Config and Runtime Notes

- Config file path is resolved via platform `ProjectDirs(dev/GitPulse/GitPulse)`.
- Data is stored locally in `gitpulse.sqlite3` under the platform data directory.
- The runtime persists settings in the database as `app_settings`.
- Per-repo include/exclude overrides are stored on the `repositories` rows as JSON and are combined with global settings patterns at snapshot time.
- Excludes still win over includes after global and repo-specific pattern lists are merged.
- The app auto-detects a default git author identity when no author emails are configured yet.
- Daily rollups are derived from UTC timestamps using the configured timezone and day-boundary offset.
- Live file activity is only recorded when a refresh meaningfully differs from the prior snapshot.
- Saving repo-specific pattern overrides immediately rescans active repos, but it does not retroactively rewrite previously stored file-activity events.

### Git Remote Notes

- This repo is intended to follow the owner’s dual-push convention:
  - `origin` fetch: `git@github.com-dunamismax:dunamismax/gitpulse.git`
  - `origin` push: `git@github.com-dunamismax:dunamismax/gitpulse.git`
  - `origin` push: `git@codeberg.org-dunamismax:dunamismax/gitpulse.git`

## 4. Code Review Findings and Status

### Positive State

- The crate split is clean and legible: `gitpulse-core` stays mostly pure, `gitpulse-infra` owns external boundaries, `gitpulse-runtime` orchestrates, and `gitpulse-web` stays thin.
- Docs are unusually well aligned for an early product: `README.md`, `docs/architecture.md`, `docs/metrics.md`, `AGENTS.md`, and this file describe the same mental model.
- Quality gates are real, not decorative: CI runs format, clippy, nextest, and cargo-deny for the main workspace path.
- Test coverage is small but meaningful. The current suite exercises repo discovery, exclusions, history import, push detection, pattern override flows, and route smoke tests.
- Local-first product boundaries are consistent throughout the codebase. Source code stays local, GitHub verification is optional, and the desktop shell reuses the same runtime/web stack instead of forking behavior.

### 2026-03-20 Comprehensive Review Addendum

#### What was re-checked in this pass

- `cargo test --workspace --exclude gitpulse-desktop` ✅
- `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings` ✅
- `cargo nextest run --workspace --exclude gitpulse-desktop` ✅

#### Specific findings

1. **High: repeated imports duplicate historical file-activity rows and inflate analytics.**
   - `GitPulseRuntime::refresh_repository()` always calls `import_repo_history(repo_id, 2)`.
   - `Database::insert_commits()` correctly uses `INSERT OR IGNORE`, but `import_repo_history()` still unconditionally writes `file_activity_events` for every imported commit, even when the commit already exists.
   - Repro during this review on a temp repo: `commit_events` stayed `1` while `file_activity_events` increased `2 -> 3` after a second `gitpulse import --repo repo --days 30`.
   - Impact: daily rollups, files-touched counts, focus sessions, and score can drift upward over time even when no new historical commits were added.

2. **High: dashboard staged totals are currently wrong.**
   - `rebuild_analytics()` reads snapshot rows but never adds `staged_additions` or `staged_deletions` into `DailyAccumulator`, so rollups persist staged values as zero.
   - Repro during this review: latest `repo_status_snapshots` row showed staged `(1, 0)` after staging a file, while the latest `daily_rollups` all-scope row remained `(0, 0)`.
   - Impact: the dashboard `TodaySummary.staged_lines` can disagree with real repository state, which undercuts trust in the metrics model.

3. **Medium: analytics rebuild work is full-history and synchronous on the hot path.**
   - Every refresh/import/settings update calls `rebuild_analytics()`, which full-scans snapshots, file events, commits, and pushes, then rewrites sessions and upserts rollups/achievements.
   - This is acceptable for small datasets, but it will get slower as users track more repos and longer histories.
   - Product risk: the current design may feel great in v1 demos and then become laggy on long-lived real usage.

4. **Medium: repo detail SVG charts currently trust unescaped labels.**
   - `render_rank_bars()` interpolates file paths and language names directly into SVG text, and the templates render that SVG with `|safe`.
   - File paths are repo-controlled input. On a local-only app this is less severe than a public web app, but it is still an avoidable XSS footgun.

5. **Medium: desktop confidence is materially lower than CLI/web confidence.**
   - CI excludes `gitpulse-desktop`, and this review did not find an automated desktop smoke path.
   - The desktop shell is intentionally thin, which is good, but release confidence is still mostly derived from CLI/web verification.

#### Test coverage gaps worth fixing next

- No security-focused test around chart-label escaping.
- No automated desktop verification path in CI.

#### Implementation follow-up (`2026-03-20`, later pass)

- Implemented: `import_repo_history()` now only writes imported `file_activity_events` for commits that were newly inserted into `commit_events`, so repeated imports no longer inflate history-derived activity.
- Implemented: `rebuild_analytics()` now carries the latest per-repo staged snapshot totals into repo-scoped and all-scope daily rollups, which fixes dashboard staged-line totals.
- Added regression coverage in `crates/gitpulse-runtime/tests/runtime_integration.rs` for both import idempotency and staged-rollup propagation.
- Verified in this pass:
  - `cargo test -p gitpulse-runtime --test runtime_integration`
  - `cargo test --workspace --exclude gitpulse-desktop`
  - `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`
- Remaining notable work:
  - escape or structurally render repo-detail SVG labels
  - decide whether full-history synchronous `rebuild_analytics()` is still acceptable before larger datasets
  - re-verify the desktop shell end to end

### Known Limits

- Live line counts are approximate, especially around repeated edits and imported historical metadata.
- Push detection is based on observed upstream state transitions rather than hooks or remote truth.
- Repo-specific pattern changes only affect future refresh/import behavior plus the immediate active-repo rescan; prior stored activity rows remain as historical truth unless a deeper cleanup flow is added later.
- The dashboard polls instead of using a more advanced streaming transport.
- Tauri desktop verification still needs a fresh local end-to-end smoke pass.

## 5. Next Pass Priorities

1. Fix import idempotency so historical commit re-imports do not append duplicate `file_activity_events`, then add a regression test.
2. Fix staged-line rollup aggregation so dashboard totals match the latest repository snapshot, then add coverage for `rebuild_analytics()`.
3. Decide whether analytics rebuilds stay full-history for v1 or move to incremental rollups before larger real-world datasets make the refresh path feel slow.
4. Escape or structurally render repo-detail chart labels instead of injecting raw SVG text from repo-controlled values.
5. Re-verify the Tauri desktop shell end to end on this machine and document the exact command/result.
6. Add a retroactive cleanup/reimport path for cases where repo-specific pattern overrides should be applied to previously stored activity history.

## 6. Next-Agent Checklist

1. Read `BUILD.md` first.
2. Then read:
   - `AGENTS.md`
   - `README.md`
   - `docs/architecture.md`
   - `docs/metrics.md`
   - `crates/gitpulse-core/src/*`
   - `crates/gitpulse-infra/src/*`
   - `crates/gitpulse-runtime/src/lib.rs`
   - `crates/gitpulse-web/src/lib.rs`
3. Re-run:
   - `cargo check --workspace --exclude gitpulse-desktop`
   - `cargo test --workspace --exclude gitpulse-desktop`
   - `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`
   - `cargo run -p gitpulse-cli -- rebuild-rollups`
   - `cargo run -p gitpulse-cli -- doctor`
4. If git parsing or rollup math changes, update tests in:
   - `crates/gitpulse-infra/tests/`
   - `crates/gitpulse-runtime/tests/`
   - `crates/gitpulse-web/tests/routes.rs`
5. If behavior or workflows change, update:
   - `BUILD.md`
   - `AGENTS.md`
   - `README.md`
   - `docs/architecture.md`
   - `docs/metrics.md`

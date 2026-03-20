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
  - Server-side SVG charts
  - Clap CLI
  - Tauri v2 shell scaffolded around the same runtime and web app
  - CI, `cargo-deny`, and `cargo-nextest` config files
  - Integration tests for repo discovery, exclusions, commit import, push detection, and route smoke coverage
- Not implemented:
  - Team or cloud mode
  - Mobile client
  - Per-repo pattern editor UI
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
| Lint | `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings` | Passed |
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
- The app auto-detects a default git author identity when no author emails are configured yet.
- Daily rollups are derived from UTC timestamps using the configured timezone and day-boundary offset.
- Live file activity is only recorded when a refresh meaningfully differs from the prior snapshot.

### Git Remote Notes

- This repo is intended to follow the owner’s dual-push convention:
  - `origin` fetch: `git@github.com-dunamismax:dunamismax/gitpulse.git`
  - `origin` push: `git@github.com-dunamismax:dunamismax/gitpulse.git`
  - `origin` push: `git@codeberg.org-dunamismax:dunamismax/gitpulse.git`

## 4. Code Review Findings and Status

### Positive State

- The runtime cleanly separates domain logic, infra boundaries, orchestration, and presentation.
- Live work, committed work, and pushed work stay distinct in both models and UI.
- The repo includes real tests rather than scaffold-only placeholders.
- CI and local tooling docs are aligned.
- The web UI ships local assets and does not depend on a CDN in production.

### Known Limits

- Live line counts are approximate, especially around repeated edits and imported historical metadata.
- Push detection is based on observed upstream state transitions rather than hooks or remote truth.
- The dashboard polls instead of using a more advanced streaming transport.
- Tauri desktop verification still needs a fresh local end-to-end smoke pass.

## 5. Next Pass Priorities

1. Add a per-repo pattern editor in the UI.
2. Add an explicit `rebuild-rollups` CLI command.
3. Re-verify the Tauri desktop shell end to end on this machine and document the exact command/result.
4. Improve today/rollup aggregation to reduce repeated live-diff overcounting in high-churn repos.

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

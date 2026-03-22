# GitPulse Agent Notes

This file is concise repo memory for future agents and developers. `BUILD.md` is the primary operational handoff document and should be read first.

## Purpose

GitPulse is a local-first Rust desktop and web app for tracking repository activity across one or many git repos. It focuses on live working-tree changes, staged work, qualifying commits, local push detection, sessions, streaks, goals, score, achievements, and lightweight historical analytics without uploading source code.

## Architecture

- `crates/gitpulse-core/`
  - Domain models, config types, score formula, streak rules, sessionization, timezone/day-boundary helpers, and achievement evaluation.
- `crates/gitpulse-infra/`
  - App directories, config loading, SQLite/SQLx persistence, migrations, git CLI parsing, exclusions, watcher service, and optional GitHub verification.
- `crates/gitpulse-runtime/`
  - Repo discovery, target add/import/refresh flows, push detection, rollup rebuilds, session rebuilds, and high-level queries for CLI/web consumers.
- `crates/gitpulse-web/`
  - Axum routes, Askama templates, HTMX partials, local assets, and server-side SVG chart rendering.
- `apps/gitpulse-cli/`
  - `serve`, `add`, `rescan`, `import`, and `doctor` commands.
- `apps/gitpulse-desktop/`
  - Thin Tauri v2 shell that hosts the same localhost UI and exposes a native folder picker bridge.
- `migrations/0001_init.sql`
  - Source of truth for the SQLite schema.

## Design Notes

- GitPulse keeps live work, committed work, and pushed work separate throughout the product.
- Canonical accounting comes from git snapshots and persisted events, not raw filesystem watcher events.
- Daily score is intentionally separate from raw stats.
- The app is useful with no GitHub token configured.
- Global include/exclude patterns are user-editable in settings, and per-repo overrides are editable from the repository detail page.
- Repo-specific pattern changes immediately rescan active repos, but they do not retroactively rewrite previously stored file-activity history.
- Analytics rebuilds remain full-history and synchronous for v1, and `gitpulse rebuild-rollups` reports scanned row counts plus elapsed time so operators can see rebuild cost.

## Verified Commands

```bash
cargo check --workspace --exclude gitpulse-desktop
cargo test --workspace --exclude gitpulse-desktop
cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings
cargo run -p gitpulse-cli -- rebuild-rollups
cargo run -p gitpulse-cli -- doctor
cargo check -p gitpulse-desktop
./scripts/desktop-smoke.sh
```

## Current Gaps

- There is no incremental or scoped analytics rebuild strategy yet; longer-lived datasets still rely on the full-history rebuild path.
- Desktop packaging expectations are now documented around an operator-run macOS `.app` bundle flow, but CI still does not build bundles and signing/notarization remain out of scope.
- There is no destructive history purge UI flow.
- Push detection is local-state-based first and optional GitHub confirmation second.

## Working Agreement

- Keep `BUILD.md`, `AGENTS.md`, `README.md`, `docs/metrics.md`, and `docs/desktop-release.md` aligned when product behavior or release workflow changes.
- Prefer adding tests when changing git parsing, rollup math, or runtime orchestration.
- If route or template behavior changes, keep the HTMX partial paths and route smoke tests in sync.
- Treat these files as first-update targets after meaningful behavior changes:
  - `crates/gitpulse-core/src/*`
  - `crates/gitpulse-infra/src/*`
  - `crates/gitpulse-runtime/src/lib.rs`
  - `crates/gitpulse-web/src/lib.rs`
  - `README.md`
  - `BUILD.md`
  - `docs/architecture.md`
  - `docs/metrics.md`
  - `docs/desktop-release.md`

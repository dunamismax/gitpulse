# GitPulse

GitPulse is a local-first Rust desktop and web app for monitoring git activity across one or many repositories in real time. It tracks live working-tree changes, staged work, qualifying commits, locally detected pushes, focus sessions, streaks, goals, score, achievements, and repository language/size snapshots without uploading source code or diffs.

## Features

- Track one repo directly or discover many repos from a parent folder
- Import the last 30 days of recent commit history on first add
- Watch working trees with a debounced notify pipeline plus periodic refresh fallback
- Keep live work, committed work, and pushed work separate
- Detect local pushes from ahead/behind transitions without git hooks
- Store analytics locally in SQLite with rebuildable daily rollups
- Edit repo-specific include/exclude overrides from the repository detail page
- Render a responsive HTMX dashboard with server-side SVG charts
- Run as:
  - a local web app with `gitpulse serve`
  - a thin Tauri v2 desktop shell that hosts the same UI on localhost

## Workspace

```text
.
├── Cargo.toml
├── rust-toolchain.toml
├── .cargo/
├── .config/
├── .github/
├── apps/
│   ├── gitpulse-cli/
│   └── gitpulse-desktop/
├── assets/
│   ├── css/
│   └── js/
├── crates/
│   ├── gitpulse-core/
│   ├── gitpulse-infra/
│   ├── gitpulse-runtime/
│   └── gitpulse-web/
├── docs/
│   ├── architecture.md
│   └── metrics.md
├── migrations/
└── gitpulse.example.toml
```

## Architecture Overview

- `gitpulse-core`
  - Domain models, score formula, streak logic, sessionization, timezone/day-boundary helpers, and achievement rules.
- `gitpulse-infra`
  - App directories, layered config loading, SQLite/SQLx persistence, migrations, git CLI adapter, GitHub verification, exclusions, and watcher service.
- `gitpulse-runtime`
  - Adds repo targets, imports history, refreshes snapshots, detects pushes, rebuilds sessions/rollups/achievements, and serves data for the UI and CLI.
- `gitpulse-web`
  - Axum routes, Askama templates, HTMX partials, local static assets, and server-side SVG chart generation.
- `apps/gitpulse-cli`
  - Clap commands for serving, adding repos, rescanning, importing, and diagnostics.
- `apps/gitpulse-desktop`
  - Thin Tauri v2 shell that launches the same runtime/server on localhost and exposes a native folder picker bridge.

More detail lives in [docs/architecture.md](/Users/sawyer/github/gitpulse/docs/architecture.md).

## Running CLI Mode

```bash
cargo run -p gitpulse-cli -- serve
```

Useful commands:

```bash
cargo run -p gitpulse-cli -- add /path/to/repo-or-folder
cargo run -p gitpulse-cli -- rescan --all
cargo run -p gitpulse-cli -- import --all --days 30
cargo run -p gitpulse-cli -- rebuild-rollups
cargo run -p gitpulse-cli -- doctor
```

`gitpulse serve` starts the local HTTP server and dashboard on `127.0.0.1:7467` by default.

## Running Desktop Mode

```bash
cargo run -p gitpulse-desktop
```

The desktop app launches the same GitPulse runtime/server on a random localhost port and loads it in a Tauri window. The web UI can also use the desktop-only native folder picker bridge when `window.__TAURI__.core.invoke` is available.

## Configuration

GitPulse uses layered config:

1. Internal defaults
2. `gitpulse.toml`
3. `GITPULSE_*` environment variables
4. CLI overrides where applicable

Sample config: [gitpulse.example.toml](/Users/sawyer/github/gitpulse/gitpulse.example.toml)

Platform-specific locations:

- Config: `ProjectDirs(dev/GitPulse/GitPulse)/config/gitpulse.toml`
- Data: `ProjectDirs(dev/GitPulse/GitPulse)/data/gitpulse.sqlite3`
- Logs: `ProjectDirs(dev/GitPulse/GitPulse)/data/logs/`

## Data and Privacy Model

- Offline-first by default
- No source code upload
- No diff content persistence
- Only metadata is stored:
  - repo identity and normalized paths
  - relative file paths
  - timestamps
  - additions/deletions counts
  - commit hashes and branch/upstream metadata
  - sessions, rollups, achievements, and settings
- Optional GitHub verification is opt-in and only sends commit metadata needed to verify remote reachability for GitHub remotes

## Caveats

- Live line counts are approximate and reflect current working-tree or imported diff metadata, not code value.
- Untracked files count as additions only when they look like text and stay under a simple size threshold.
- Binary churn, generated paths, vendored content, lockfiles, and common build outputs are excluded by default.
- Global patterns can be overridden per repository from the detail page, but excludes still win over includes.
- Commit and push history totals are filtered by configured author identities. Live local activity always counts.
- Changing repo-specific patterns immediately rescans active repos, but it does not retroactively rewrite previously stored file-activity history.

More detail lives in [docs/metrics.md](/Users/sawyer/github/gitpulse/docs/metrics.md).

# GitPulse

GitPulse is a local-first Rust desktop and web app for monitoring git activity across one or many repositories in real time. It tracks live working-tree changes, staged work, qualifying commits, locally detected pushes, focus sessions, streaks, goals, score, achievements, and repository language/size snapshots without uploading source code or diffs.

## Current Status

GitPulse is already a real product surface, not just a metrics prototype.

The current repository includes:

- a local web app built with Axum, Askama, and HTMX
- a thin Tauri v2 desktop shell that hosts the same localhost UI
- repository discovery from a parent folder or direct repo add flows
- import of recent commit history for tracked repositories
- live working-tree and staged snapshotting
- local push detection from ahead/behind transitions
- streaks, goals, sessions, rollups, score, and achievements
- repo-specific include/exclude overrides from the repository detail page

It is currently:

- local-first and offline-first by default
- focused on personal repository analytics rather than team or cloud workflows
- built around metadata, not source-code upload or diff upload

It does **not** currently include:

- team or cloud mode
- a mobile client
- an explicit history-purge UI flow

## Quick Start

Run the local web app:

```bash
cargo run -p gitpulse-cli -- serve
```

Useful CLI commands:

```bash
cargo run -p gitpulse-cli -- add /path/to/repo-or-folder
cargo run -p gitpulse-cli -- rescan --all
cargo run -p gitpulse-cli -- import --all --days 30
cargo run -p gitpulse-cli -- rebuild-rollups
cargo run -p gitpulse-cli -- doctor
```

`gitpulse serve` starts the local HTTP server and dashboard on `127.0.0.1:7467` by default.

Run the desktop shell:

```bash
cargo run -p gitpulse-desktop
```

The desktop app launches the same GitPulse runtime/server on a random localhost port and loads it in a Tauri window. The web UI can also use the desktop-only native folder picker bridge when `window.__TAURI__.core.invoke` is available.

For a repeatable desktop self-check, run:

```bash
./scripts/desktop-smoke.sh
```

That smoke gate boots the Tauri shell, waits for the localhost UI to answer, prints the bound URL, and exits on its own with a non-zero status if startup never becomes healthy.

## Why The Product Model Matters

GitPulse keeps three categories separate on purpose:

- live work in the working tree
- committed work
- pushed work

That separation is part of the product, not a reporting accident. The app is trying to answer questions like:

- what am I actively changing right now?
- what did I actually commit?
- what has really moved toward a remote?

It also stays deliberately local-first:

- no source code upload
- no diff content persistence
- optional GitHub verification only when explicitly configured

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

More detail lives in [docs/architecture.md](docs/architecture.md).

## Configuration

GitPulse uses layered config:

1. Internal defaults
2. `gitpulse.toml`
3. `GITPULSE_*` environment variables
4. CLI overrides where applicable

Sample config: [gitpulse.example.toml](gitpulse.example.toml)

Platform-specific locations:

- Config: `ProjectDirs(dev/GitPulse/GitPulse)/config/gitpulse.toml`
- Data: `ProjectDirs(dev/GitPulse/GitPulse)/data/gitpulse.sqlite3`
- Logs: `ProjectDirs(dev/GitPulse/GitPulse)/data/logs/`

## Local Verification

Common local verification paths:

```bash
cargo check --workspace --exclude gitpulse-desktop
cargo test --workspace --exclude gitpulse-desktop
cargo nextest run --workspace --exclude gitpulse-desktop
cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings
cargo run -p gitpulse-cli -- doctor
cargo run -p gitpulse-cli -- rebuild-rollups
cargo check -p gitpulse-desktop
./scripts/desktop-smoke.sh
```

CI keeps the main Linux lane focused on CLI/web checks and runs a dedicated macOS desktop compile check separately. The desktop smoke script remains the release-critical local startup gate. See [BUILD.md](BUILD.md) for the reviewed command set and current verification notes.

## Data And Privacy Model

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

## Current Caveats

- Live line counts are approximate and reflect current working-tree or imported diff metadata, not code value.
- Untracked files count as additions only when they look like text and stay under a simple size threshold.
- Binary churn, generated paths, vendored content, lockfiles, and common build outputs are excluded by default.
- Global patterns can be overridden per repository from the detail page, but excludes still win over includes.
- Commit and push history totals are filtered by configured author identities. Live local activity always counts.
- Changing repo-specific patterns immediately rescans active repos, but it does not retroactively rewrite previously stored file-activity history.

More detail lives in [docs/metrics.md](docs/metrics.md).

## Repo Docs

- [BUILD.md](BUILD.md)
  - canonical operational handoff, verified commands, and current review findings
- [AGENTS.md](AGENTS.md)
  - concise repo memory for future coding passes
- [docs/architecture.md](docs/architecture.md)
  - crate boundaries and runtime design
- [docs/metrics.md](docs/metrics.md)
  - metric semantics and caveats

## License

MIT. See [`LICENSE`](LICENSE).

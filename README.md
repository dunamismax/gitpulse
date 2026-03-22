# GitPulse

GitPulse is a local-first Rust desktop and web app for tracking git activity across one or many repositories. It watches live working-tree changes, imports recent history, and serves the same localhost UI to the browser and the thin Tauri desktop shell without uploading source code or diffs.

## Current state

GitPulse is already a real local product surface, not just a metrics sketch.

It currently includes:

- a local Axum + Askama + HTMX dashboard
- a thin Tauri v2 desktop shell over the same runtime and routes
- direct repo add plus parent-folder discovery flows
- live working-tree and staged snapshotting
- recent-history import for tracked repositories
- local push detection, focus sessions, streaks, goals, score, achievements, and rollups
- repo-specific include/exclude overrides from the repository detail page

It is intentionally:

- local-first and offline-first by default
- focused on personal repository analytics rather than team or cloud workflows
- built around metadata and derived analytics, not source-code upload

It does **not** currently include:

- team or cloud mode
- a mobile client
- an explicit history-purge UI flow

## Quick start

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

`gitpulse serve` starts the dashboard on `127.0.0.1:7467` by default.

Run the desktop shell:

```bash
cargo run -p gitpulse-desktop
```

The desktop app launches the same GitPulse runtime on a random localhost port, loads the same UI in a Tauri window, and exposes a native folder-picker bridge when the desktop shell is available.

For a repeatable desktop startup check, run:

```bash
./scripts/desktop-smoke.sh
```

For the currently supported macOS bundle flow, use:

```bash
./scripts/desktop-package.sh
```

That packaging path is intentionally limited to an unsigned macOS `.app` bundle for now. See [docs/desktop-release.md](docs/desktop-release.md).

## Product model

GitPulse keeps three ledgers separate on purpose:

- live work in the working tree
- committed work
- pushed work

That separation is part of the product, not a reporting accident. The app is trying to answer different questions cleanly:

- what am I actively changing right now?
- what did I actually commit?
- what has really moved toward a remote?

It also stays deliberately local-first:

- no source code upload
- no diff content persistence
- optional GitHub verification only when explicitly configured

## Architecture overview

- `gitpulse-core`
  - Domain models, score formula, streak logic, sessionization, timezone/day-boundary helpers, and achievement rules.
- `gitpulse-infra`
  - App directories, layered config loading, SQLite/SQLx persistence, migrations, git CLI integration, exclusions, watcher service, and optional GitHub verification.
- `gitpulse-runtime`
  - Repo discovery, add/import/refresh orchestration, push detection, analytics rebuilds, and high-level queries for the CLI, web UI, and desktop shell.
- `gitpulse-web`
  - Axum routes, Askama templates, HTMX partials, local assets, and server-side SVG chart generation.
- `apps/gitpulse-cli`
  - `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor` commands.
- `apps/gitpulse-desktop`
  - Thin Tauri v2 shell that hosts the same localhost UI and exposes a native folder picker bridge.

More detail lives in [docs/architecture.md](docs/architecture.md).

## Configuration

GitPulse uses layered config:

1. internal defaults
2. `gitpulse.toml`
3. `GITPULSE_*` environment variables
4. CLI overrides where applicable

Sample config: [gitpulse.example.toml](gitpulse.example.toml)

Platform-specific locations:

- config: `ProjectDirs(dev/GitPulse/GitPulse)/config/gitpulse.toml`
- data: `ProjectDirs(dev/GitPulse/GitPulse)/data/gitpulse.sqlite3`
- logs: `ProjectDirs(dev/GitPulse/GitPulse)/data/logs/`

## Local verification

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

CI keeps the main Linux lane focused on CLI/web checks and runs a dedicated macOS desktop compile lane separately. Bundle builds are still operator-run on macOS rather than CI-produced release artifacts. See [BUILD.md](BUILD.md) for the reviewed command history and current open risks.

## Data and privacy model

- offline-first by default
- no source code upload
- no diff content persistence
- only metadata is stored:
  - repo identity and normalized paths
  - relative file paths
  - timestamps
  - additions/deletions counts
  - commit hashes and branch/upstream metadata
  - sessions, rollups, achievements, and settings
- optional GitHub verification is opt-in and only sends commit metadata needed to verify remote reachability for GitHub remotes

## Current caveats

- Live line counts are approximate and reflect current working-tree or imported diff metadata, not code value.
- Untracked files count as additions only when they look like text and stay under a simple size threshold.
- Binary churn, generated paths, vendored content, lockfiles, and common build outputs are excluded by default.
- Global patterns can be overridden per repository from the detail page, but excludes still win over includes.
- Commit and push history totals are filtered by configured author identities. Live local activity always counts.
- Changing repo-specific patterns immediately rescans active repos, but it does not retroactively rewrite previously stored file-activity history.
- Analytics rebuilds are still full-history and synchronous for now.

More detail lives in [docs/metrics.md](docs/metrics.md).

## Repo docs

- [BUILD.md](BUILD.md)
  - canonical operational handoff, phase/status tracking, verification history, and current risks
- [AGENTS.md](AGENTS.md)
  - concise repo memory for future coding passes
- [docs/architecture.md](docs/architecture.md)
  - crate boundaries and runtime design
- [docs/metrics.md](docs/metrics.md)
  - metric semantics and caveats
- [docs/desktop-release.md](docs/desktop-release.md)
  - current desktop packaging scope and operator workflow

## License

MIT. See [`LICENSE`](LICENSE).

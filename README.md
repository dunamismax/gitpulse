# GitPulse

**Local-first git activity analytics for developers who care about their craft.**

GitPulse watches your repositories, tracks your commits, sessions, and streaks, and gives you an honest picture of how you work — without uploading a single line of source code. It keeps three separate ledgers — live work, committed work, and pushed work — because collapsing them into one number destroys the signal. One Rust runtime powers the CLI, browser dashboard, and native desktop app so they never drift apart.

[![CI](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/dunamismax/gitpulse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Status: v0.1 release-ready.** The core product — CLI, local web dashboard, macOS desktop shell, commit import, push detection, sessions, streaks, and scoring — is implemented and passing all quality gates. See [BUILD.md](BUILD.md) for the full execution plan and explicit scope boundaries.

## Why GitPulse?

Most developer analytics tools want your code in their cloud. GitPulse doesn't.

| Approach | Local-first | No source upload | Separates ledgers | Offline | Desktop + Web |
|----------|:---:|:---:|:---:|:---:|:---:|
| GitHub Insights | No | No | No | No | Web only |
| WakaTime | No | Partial | No | No | Web only |
| Git-standup / git-stats | Yes | Yes | No | Yes | CLI only |
| Manual log review | Yes | Yes | No | Yes | Neither |
| **GitPulse** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |

- **Your code stays on your machine.** No source upload, no diff content persistence, no telemetry phone-home.
- **Three ledgers, not one number.** Live work, committed work, and pushed work are tracked separately because they mean different things.
- **One runtime, every surface.** CLI, browser dashboard, and native desktop app all share the same engine and data.
- **Works offline.** No GitHub token required. No internet required. GitHub integration is optional and supplemental.
- **Honest metrics.** Line counts are approximate operational telemetry, not a measure of your worth. The UI says so.

## What it does

- Watches live working-tree and staged changes across tracked repositories
- Imports recent commit history with configurable lookback
- Detects local pushes from upstream state transitions
- Optionally verifies pushes against the GitHub API
- Computes focus sessions, daily rollups, streaks, goals, and score
- Generates server-side SVG charts for activity trends, heatmaps, and language breakdowns
- Supports per-repo include/exclude pattern overrides
- Serves everything through a local Axum + Askama + HTMX dashboard
- Wraps the same UI in a thin Tauri v2 desktop shell with native folder picking

## Quick start

### Prerequisites

- [Rust](https://rustup.rs/) (stable, 1.85+; tested with 1.94)
- Git (2.30+)
- SQLite (bundled via SQLx — no system install needed)

### Run the dashboard

```bash
git clone https://github.com/dunamismax/gitpulse.git
cd gitpulse
cargo run -p gitpulse-cli -- serve
```

Open `http://127.0.0.1:7467` in your browser.

### Track repositories

```bash
# Add a single repo
cargo run -p gitpulse-cli -- add /path/to/your/repo

# Or discover all repos under a folder
cargo run -p gitpulse-cli -- add /path/to/projects

# Import last 30 days of history
cargo run -p gitpulse-cli -- import --all --days 30

# Rescan all tracked repos
cargo run -p gitpulse-cli -- rescan --all
```

### CLI reference

| Command | Purpose |
|---------|---------|
| `serve` | Start the web dashboard on localhost:7467 |
| `add <path>` | Track a repo or discover repos in a folder |
| `rescan --all\|--repo <id>` | Refresh repository snapshots |
| `import --all\|--repo <id> --days N` | Import historical commits |
| `rebuild-rollups` | Rebuild all derived analytics from raw events |
| `doctor` | Run diagnostic checks |

### Desktop app

```bash
cargo run -p gitpulse-desktop
```

The desktop shell launches the same runtime on a random localhost port, loads the dashboard in a native window, and adds a native folder picker. See [docs/desktop-release.md](docs/desktop-release.md) for packaging.

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│              CLI / Web Dashboard / Desktop                │
│         (gitpulse-cli, gitpulse-web, gitpulse-desktop)   │
└────────────────────────┬─────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  gitpulse-runtime   │
              │                     │
              │  repo discovery     │
              │  import/refresh     │
              │  push detection     │
              │  analytics rebuild  │
              │  query API          │
              └───┬─────────────┬───┘
                  │             │
      ┌───────────▼───┐   ┌────▼──────────┐
      │ gitpulse-core │   │ gitpulse-infra │
      │               │   │                │
      │ domain models │   │ SQLite/SQLx    │
      │ score formula │   │ config loading │
      │ streak logic  │   │ git CLI        │
      │ sessions      │   │ file watcher   │
      │ timezone/day  │   │ GitHub API     │
      │ achievements  │   │ exclusions     │
      └───────────────┘   └────────────────┘
```

| Crate | Responsibility |
|-------|---------------|
| `gitpulse-core` | Domain models, score formula, streak logic, sessions, timezone handling, achievements |
| `gitpulse-infra` | SQLite persistence, config loading, git CLI integration, file watching, GitHub API, exclusion patterns |
| `gitpulse-runtime` | Repo discovery, import/refresh orchestration, push detection, analytics rebuilds, query API |
| `gitpulse-web` | Axum routes, Askama templates, HTMX partials, SVG chart rendering |
| `gitpulse-cli` | Headless CLI entrypoint |
| `gitpulse-desktop` | Thin Tauri v2 shell over the same runtime |

Full architecture details: [docs/architecture.md](docs/architecture.md)

## Product model

GitPulse keeps three activity ledgers separate on purpose:

| Ledger | Question it answers |
|--------|-------------------|
| **Live work** | What am I actively changing right now? |
| **Committed work** | What did I actually commit? |
| **Pushed work** | What has moved toward a remote? |

This separation is the product, not a reporting accident. Collapsing them into one number would destroy the signal.

## Configuration

GitPulse uses layered config with sensible defaults:

1. Internal defaults
2. `gitpulse.toml` (platform-specific location)
3. `GITPULSE_*` environment variables
4. CLI overrides

See [gitpulse.example.toml](gitpulse.example.toml) for all options.

**Platform paths:**

| Platform | Config | Data |
|----------|--------|------|
| macOS | `~/Library/Application Support/dev.GitPulse.GitPulse/gitpulse.toml` | `~/Library/Application Support/dev.GitPulse.GitPulse/gitpulse.sqlite3` |
| Linux | `~/.config/dev/GitPulse/GitPulse/gitpulse.toml` | `~/.local/share/dev/GitPulse/GitPulse/gitpulse.sqlite3` |
| Windows | `%APPDATA%\dev\GitPulse\GitPulse\config\gitpulse.toml` | `%APPDATA%\dev\GitPulse\GitPulse\data\gitpulse.sqlite3` |

## Privacy and data model

- **Offline-first by default.** No external service required.
- **No source code upload.** Only metadata: repo identity, file paths, timestamps, line counts, commit hashes, branch info.
- **No diff content persistence.** Diffs are read, counted, and discarded.
- **GitHub verification is opt-in.** Only sends commit metadata needed to check remote reachability.
- **All data is local SQLite.** Inspect it, back it up, delete it — it's your file.

## Metrics and scoring

GitPulse tracks:

- **Live/staged line changes** — current working-tree snapshot, not accumulated
- **Commit totals** — filtered by configured author identities
- **Push detection** — from ahead/behind state transitions + optional GitHub confirmation
- **Focus sessions** — contiguous activity windows (default: 15-min gap threshold)
- **Streaks** — consecutive qualifying days (commits, lines, or focus time)
- **Score** — momentum metric: `floor(lines/20) + 50*commits + 80*pushes + 2*focus_minutes`

Score is not a proxy for code quality. The UI makes that clear.

Full metric semantics: [docs/metrics.md](docs/metrics.md)

## Local verification

```bash
cargo check --workspace --exclude gitpulse-desktop
cargo test --workspace --exclude gitpulse-desktop
cargo nextest run --workspace --exclude gitpulse-desktop
cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings
cargo run -p gitpulse-cli -- doctor
./scripts/desktop-smoke.sh
```

## Repository layout

```text
.
├── BUILD.md                          # execution manual — phases, decisions, progress
├── README.md                         # public-facing project description, honest status
├── ROADMAP.md                        # public-facing product vision and milestones
├── CONTRIBUTING.md                   # development setup and contribution workflow
├── CHANGELOG.md                      # release history
├── AGENTS.md                         # concise repo memory for contributors
├── LICENSE                           # MIT
├── Cargo.toml                        # workspace root
├── gitpulse.example.toml             # config surface
├── migrations/
│   └── 0001_init.sql                 # SQLite schema baseline
├── apps/
│   ├── gitpulse-cli/                 # headless CLI entrypoint
│   └── gitpulse-desktop/             # Tauri v2 desktop shell
├── crates/
│   ├── gitpulse-core/                # domain models, score, streaks, sessions
│   ├── gitpulse-infra/               # persistence, config, git CLI, watcher, GitHub
│   ├── gitpulse-runtime/             # orchestration, discovery, import, analytics
│   └── gitpulse-web/                 # Axum routes, Askama templates, SVG charts
├── assets/
│   ├── css/                          # shared stylesheets
│   └── js/                           # HTMX and app scripts
├── scripts/
│   ├── desktop-smoke.sh              # release-critical desktop startup gate
│   └── desktop-package.sh            # macOS .app bundle helper
└── docs/
    ├── architecture.md               # crate boundaries and data flow
    ├── metrics.md                    # metric definitions and caveats
    ├── desktop-release.md            # desktop packaging scope
    └── plugin-architecture.md        # extension system design (planned)
```

## Roadmap

| Phase | Name | Status |
|-------|------|--------|
| 0 | Product charter and source-of-truth capture | **Done** |
| 1 | Workspace, schema, and infrastructure foundation | **Done** |
| 2 | Runtime orchestration and analytics model | **Done** |
| 3 | Web dashboard and shared product surfaces | **Done** |
| 4 | Correctness hardening and regression coverage | **Done** |
| 5 | Trust and output hardening | **Done** |
| 6 | Performance and rebuild strategy | Deferred (v0.1 ships with full-history rebuild) |
| 7 | Desktop confidence and release operations | **Done** |
| 8 | Data lifecycle and operator controls | Deferred to post-v0.1 |
| 9 | v1 stabilization and release readiness | **In progress** |
| 10 | REST API and programmatic access | Planned |
| 11 | Plugin and extension system | Planned |
| 12 | Advanced analytics and insights | Planned |
| 13 | Cross-platform desktop releases | Planned |
| 14+ | Notifications, sync, IDE integrations, mobile | Planned |

See [BUILD.md](BUILD.md) for the full phase breakdown with tasks, exit criteria, risks, and decisions. See [ROADMAP.md](ROADMAP.md) for the public-facing product vision.

## Design principles

1. **Local-first, always.** GitPulse should remain useful with no cloud service, no diff upload, and no token configured. Optional integrations are additive, never required.
2. **Separate the ledgers.** Live work, committed work, and pushed work stay conceptually distinct. The product dies the moment they collapse into one number.
3. **One runtime, thin shells.** CLI, web, and desktop share the same engine. Surface-specific code stays minimal. Behavior never forks across shells.
4. **Rebuildable analytics.** Raw events remain rich enough that sessions, rollups, and achievements can be recalculated intentionally. Derived data is always disposable.
5. **Explicit caveats beat false precision.** Approximate metrics are fine if the approximation is documented and the UI does not pretend otherwise.
6. **Git truth comes from the git boundary.** Canonical repo state comes from git snapshots and persisted events, not from raw watcher noise.
7. **Docs and tests move with behavior.** If metric semantics, runtime behavior, or operator workflows change, update docs and regression coverage in the same pass.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture guidelines, and contribution workflow.

## Documentation

| Document | Purpose |
|----------|---------|
| [BUILD.md](BUILD.md) | Execution ledger, phase tracking, verification history, decision log |
| [ROADMAP.md](ROADMAP.md) | Public-facing product vision and milestones |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and contribution guidelines |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [AGENTS.md](AGENTS.md) | Concise repo memory for contributors |
| [docs/architecture.md](docs/architecture.md) | Crate boundaries and data flow |
| [docs/metrics.md](docs/metrics.md) | Metric definitions, semantics, and caveats |
| [docs/desktop-release.md](docs/desktop-release.md) | Desktop packaging scope and workflow |
| [docs/plugin-architecture.md](docs/plugin-architecture.md) | Extension system design (planned) |

## License

MIT — see [LICENSE](LICENSE).

# Contributing to GitPulse

GitPulse welcomes contributions. This document covers the development setup, architecture conventions, and contribution workflow.

## Development setup

### Prerequisites

- Rust stable (1.85+) via [rustup](https://rustup.rs/)
- Git 2.30+
- SQLite 3.35+ (bundled via SQLx, but useful for inspection)
- [cargo-nextest](https://nexte.st/) for running tests
- [cargo-deny](https://github.com/EmbarkStudios/cargo-deny) for dependency auditing

### Optional

- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) (`cargo install tauri-cli`) — only needed for desktop builds
- A GitHub personal access token — only needed if you want to test GitHub push verification

### First build

```bash
git clone https://github.com/dunamismax/gitpulse.git
cd gitpulse
cargo check --workspace --exclude gitpulse-desktop
cargo test --workspace --exclude gitpulse-desktop
```

Desktop builds require macOS and the Tauri CLI:

```bash
cargo check -p gitpulse-desktop
```

## Architecture rules

GitPulse has strict crate boundaries. Respect them.

| Crate | Owns | Must not depend on |
|-------|------|--------------------|
| `gitpulse-core` | Domain models, score, streaks, sessions, timezone rules | Any I/O, database, HTTP, or framework crate |
| `gitpulse-infra` | SQLite, config, git CLI, file watching, GitHub API | `gitpulse-runtime`, `gitpulse-web`, app crates |
| `gitpulse-runtime` | Orchestration, discovery, analytics rebuilds | `gitpulse-web`, app crates |
| `gitpulse-web` | Routes, templates, SVG rendering | App crates |
| `gitpulse-cli` | CLI entrypoint | `gitpulse-desktop` |
| `gitpulse-desktop` | Tauri shell, folder picker bridge | `gitpulse-cli` |

**Key principles:**

- Product rules belong in `gitpulse-core`, not in routes or templates.
- External boundaries (DB, git, network) belong in `gitpulse-infra`.
- Orchestration belongs in `gitpulse-runtime`.
- Presentation surfaces (`gitpulse-web`, CLI, desktop) should be thin.
- Repo-controlled strings are untrusted input, even in a local-first app.

## Making changes

### Before you start

1. Read [BUILD.md](BUILD.md) for current status, open decisions, and phase context.
2. Read [docs/architecture.md](docs/architecture.md) for crate boundaries.
3. If your change touches metrics, read [docs/metrics.md](docs/metrics.md).

### Quality gates

Every PR must pass:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings
cargo nextest run --workspace --exclude gitpulse-desktop
cargo deny check
```

### Testing expectations

- **Git parsing or repo discovery changes:** Add or update tests in `crates/gitpulse-infra/tests/`.
- **Analytics, rollup, or session changes:** Add or update tests in `crates/gitpulse-runtime/tests/`.
- **Route or template changes:** Add or update tests in `crates/gitpulse-web/tests/`.
- **Score formula or domain logic changes:** Add or update tests in `crates/gitpulse-core/`.

### Documentation expectations

If your change affects:

- **Metric semantics** — update `docs/metrics.md`
- **Crate boundaries** — update `docs/architecture.md`
- **Desktop packaging** — update `docs/desktop-release.md`
- **User-facing behavior** — update `README.md`
- **Phase status or decisions** — update `BUILD.md`

## Commit messages

Write clear, descriptive commit messages. One logical change per commit. No need for conventional commit prefixes — just be clear about what changed and why.

## Code style

- Run `cargo fmt` before committing.
- Follow existing patterns in the crate you're modifying.
- Prefer explicit error handling over `.unwrap()` — clippy enforces this.
- No `unsafe` code — the workspace forbids it.
- Keep dependencies minimal. New deps need justification.

## Opening a PR

1. Fork the repo and create a feature branch.
2. Make your changes with tests and doc updates.
3. Run the full quality gate locally.
4. Open a PR with a clear description of what changed and why.
5. Reference any related issues or BUILD.md phases.

## Issue reporting

Open an issue on GitHub with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your platform (OS, Rust version, git version)
- Relevant `gitpulse doctor` output if applicable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

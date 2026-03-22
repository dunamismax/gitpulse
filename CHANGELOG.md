# Changelog

All notable changes to GitPulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Local Axum + Askama + HTMX web dashboard
- Thin Tauri v2 desktop shell over the same runtime
- CLI with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor` commands
- Parent-folder repository discovery and direct repo add
- Recent-history commit import with configurable lookback
- Live working-tree and staged diff snapshotting
- Untracked text-file line counting
- Local push detection from ahead/behind state transitions
- Optional GitHub-based remote push confirmation
- Focus sessions with configurable inactivity gap
- Daily rollups, streaks, goals, score, and achievements
- Per-repo include/exclude pattern overrides from repository detail page
- Server-side SVG chart rendering (trends, heatmaps, language breakdowns)
- Layered configuration (defaults, TOML file, env vars, CLI overrides)
- SQLite persistence with rebuildable analytics
- CI pipeline with format, clippy, nextest, cargo-deny, and macOS desktop compile lane
- Repeatable desktop smoke test via `scripts/desktop-smoke.sh`
- Operator-run macOS `.app` bundle packaging via `scripts/desktop-package.sh`

### Fixed
- Historical import idempotency (repeated imports no longer inflate analytics)
- Staged snapshot propagation into daily rollups
- Missing-repo startup handling (stale paths disable cleanly instead of aborting)
- Daily rollup trust (live/staged totals derive from latest per-day snapshot)
- SVG chart label escaping for repo-controlled strings
- GitHub token masking in settings UI
- Optional GitHub verification fails open on unsupported remote formats

### Security
- Repo-controlled text escaped before entering SVG output
- Stored GitHub tokens hidden from settings HTML rendering

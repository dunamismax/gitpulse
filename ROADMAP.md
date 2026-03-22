# GitPulse Roadmap

This document outlines the product vision for GitPulse across three major milestones. It complements [BUILD.md](BUILD.md), which tracks execution details and verification history.

## Vision

GitPulse aims to be the definitive local-first developer analytics platform — a tool that helps developers understand their work patterns, maintain momentum, and stay honest about their output, all without sacrificing privacy or shipping source code to a cloud service.

The long-term goal is a plugin-extensible platform that works across devices, integrates with the tools developers already use, and optionally supports team-level insights without becoming surveillance.

## v1 — Local-first foundation

**Status:** In progress. Core product is functional. Hardening and stabilization underway.

**Goal:** Ship a reliable, trustworthy, local-first analytics tool for individual developers.

| Milestone | Status | Description |
|-----------|--------|-------------|
| Core analytics engine | Done | Commits, pushes, sessions, streaks, score, achievements |
| Web dashboard | Done | Axum + Askama + HTMX with SVG charts |
| Desktop app | In progress | Thin Tauri v2 shell, packaging workflow |
| Correctness hardening | Done | Idempotent imports, rollup trust, input escaping |
| Performance strategy | Not started | Incremental rebuilds for large datasets |
| Data lifecycle | Not started | History purge, stale repo cleanup, pattern retroactivity |
| v1 release | Not started | Docs alignment, quality gates, release checklist |

**What ships with v1:**
- CLI with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, `doctor`
- Browser-based dashboard on localhost
- macOS desktop app (unsigned `.app` bundle)
- SQLite-backed persistence with rebuildable analytics
- Layered configuration with sane defaults
- Per-repo include/exclude pattern overrides

## v2 — Platform and extensibility

**Status:** Planning. No code yet.

**Goal:** Transform GitPulse from a standalone tool into an extensible platform that developers can build on.

| Milestone | Description |
|-----------|-------------|
| REST API | Versioned JSON API for all analytics data. API key auth. OpenAPI spec. Webhook support. |
| Plugin system | Extension architecture for custom metrics, achievements, widgets, and data sources. TOML manifests. Process-level or WASM isolation. |
| Advanced analytics | Time-of-day heatmaps, velocity trends, cross-repo correlation, weekly digests, developer profiles. |
| Cross-platform desktop | Windows and Linux builds. CI-produced artifacts. Code signing. Auto-update. |
| Notifications | Native desktop notifications, streak alerts, goal completion, webhook-based external delivery. |

**Design principles for v2:**
- The API is the integration surface. IDE extensions, mobile apps, and external dashboards consume the API — they don't duplicate the runtime.
- Plugins extend, they don't fork. A well-behaved plugin should survive core upgrades.
- Advanced analytics stay interpretable. No black-box scoring. Everything derivable from stored events.
- Cross-platform is CI-driven. No more operator-run packaging as the primary distribution path.

## v3 — Connectivity and ecosystem

**Status:** Vision. Informed by v1 and v2 experience.

**Goal:** Connect GitPulse across devices, teams, and the broader developer tool ecosystem while preserving local-first principles.

| Milestone | Description |
|-----------|-------------|
| Multi-device sync | Optional, end-to-end encrypted sync across machines. Self-hostable server. CRDTs or operation-based merge. |
| IDE integrations | VS Code and JetBrains plugins showing status bar stats, mini-dashboards, and focus mode integration. |
| External integrations | GitLab, Gitea, Bitbucket verification. Jira/Linear ticket correlation. Calendar integration. |
| Team analytics | Opt-in aggregate dashboards. Privacy-first design. No individual leaderboards by default. Self-hostable. |
| Mobile companion | Read-only companion app for checking stats on the go. Push notifications for streaks and achievements. |

**Non-negotiable constraints for v3:**
- Sync is optional. GitPulse must remain fully functional as a single-machine tool.
- Sync is encrypted end-to-end. The sync server never sees plaintext data.
- Team analytics are opt-in at every level. Individuals control what they share.
- No vendor lock-in. Self-hosting is always an option.

## What GitPulse will never be

- **A code review tool.** GitPulse tracks activity, not quality.
- **A surveillance tool.** Team features exist for team awareness, not individual monitoring.
- **A cloud-first SaaS.** The local-first model is a feature, not a limitation to overcome.
- **A replacement for git.** GitPulse reads from git. It doesn't modify your repositories.
- **A gamification trap.** Score exists to reward momentum, not to create anxiety. The UI makes this explicit.

## Contributing to the roadmap

The roadmap is a living document. If you have ideas, open an issue or start a discussion. Priorities shift based on real usage and feedback, not speculation.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get involved in development.

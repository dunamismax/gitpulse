# GitPulse Roadmap

This is the product roadmap, not the execution ledger. For the current repo state and verification history, read [BUILD.md](BUILD.md). For the active migration checklist, read [REWRITE_TRACKER.md](REWRITE_TRACKER.md).

## Vision

GitPulse should become a trustworthy local-first developer analytics tool that helps an individual understand their own work without shipping source code to somebody else's cloud.

Long term, it can grow into an extensible platform with APIs, plugins, and optional connectivity. That only matters if the local single-machine product stays solid, inspectable, and privacy-respecting.

## Current reality

The repository is in an active rewrite from the legacy Rust/Tauri implementation to a Go-first stack with PostgreSQL and raw SQL.

Near-term roadmap decisions:

- stabilize the Go CLI + local web dashboard first
- prove the PostgreSQL-backed happy path end to end
- only revisit native-shell packaging after the core runtime is solid
- treat Zig/C as the future native path if one is still needed

## Milestone 1 — Go rewrite parity

**Status:** In progress

Goal: make the Go rewrite the clear primary implementation for local use.

Targets:

- CLI commands: `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, `doctor`
- PostgreSQL-backed event and rollup model
- dashboard, repositories, sessions, achievements, and settings pages
- rebuilt sessions, streaks, score, and achievements logic
- operator-facing docs and reproducible local setup

Still needed:

- live PostgreSQL smoke verification
- integration tests
- watcher/background monitoring loop
- settings persistence
- GitHub push verification parity where it is still worth keeping
- removal or quarantine of the legacy Rust tree

## Milestone 2 — Hardening and product usability

**Status:** Planned

Goal: make the rewritten app comfortable to run daily.

Possible scope:

- more focused runtime and database tests
- better error handling and diagnostics
- explicit migration/version handling beyond the bootstrap schema
- data lifecycle controls
- incremental rebuild strategy if full rebuilds become painful
- native packaging only if it earns its keep

## Milestone 3 — Platform surface area

**Status:** Planned

Goal: expand GitPulse without turning it into surveillance software.

Possible scope:

- REST API
- plugin or extension model
- optional notifications
- richer analytics views
- self-hostable sync or multi-machine workflows
- IDE integrations

## Non-negotiables

- local-first stays the default
- no source upload
- metrics remain inspectable and explainable
- team features, if they ever exist, must stay opt-in and privacy-respecting
- the product should still be useful offline and on a single machine

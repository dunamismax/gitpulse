# GitPulse Roadmap

This is the product roadmap, not the execution ledger. For the current repo state and verification history, read [BUILD.md](BUILD.md).

## Vision

GitPulse should become a trustworthy local-first developer analytics tool that helps an individual understand their own work without shipping source code to somebody else's cloud.

Long term, it can grow into an extensible platform with APIs, plugins, and optional connectivity. That only matters if the local single-machine product stays solid, inspectable, and privacy-respecting.

## Current reality

The repository currently centers on:

- Go runtime and CLI
- SQLite persistence with plain SQL
- a local browser dashboard built with Astro and served by the Go runtime

Near-term roadmap decisions:

- stabilize the Go CLI + local web dashboard first
- prove the local add/import/rescan/rebuild happy path end to end
- harden the SQLite-backed runtime instead of adding extra infrastructure
- treat packaging as optional follow-on work, not a current product surface

## Milestone 1 — operator-ready Go runtime

**Status:** In progress

Goal: make the current Go runtime comfortable to run locally every day.

Targets:

- CLI commands: `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, `doctor`
- SQLite-backed event and rollup model
- dashboard, repositories, sessions, achievements, and settings pages
- rebuilt sessions, streaks, score, and achievements logic
- operator-facing docs and reproducible local setup

Still needed:

- live local smoke verification across the main CLI flow
- more integration tests
- watcher/background monitoring loop
- GitHub push verification parity where it is still worth keeping

## Milestone 2 — hardening and product usability

**Status:** Planned

Goal: make the app resilient and pleasant to operate.

Possible scope:

- more focused runtime and database tests
- better error handling and diagnostics
- explicit migration/version handling beyond the bootstrap schema
- data lifecycle controls
- incremental rebuild strategy if full rebuilds become painful
- packaging only if it earns its keep

## Milestone 3 — platform surface area

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

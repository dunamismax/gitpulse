# GitPulse Roadmap

This is the product roadmap. For the current operator loop and day-to-day run instructions, read [README.md](README.md) and [docs/operator-workflow.md](docs/operator-workflow.md).

## Vision

GitPulse should become a trustworthy local-first developer analytics tool that helps an individual understand their own work without shipping source code to somebody else's cloud.

Long term, it can grow into an extensible platform with APIs, plugins, and optional connectivity. That only matters if the local single-machine product stays solid, inspectable, and privacy-respecting.

## Current reality

The repository currently centers on:

- Go runtime and CLI
- SQLite persistence with plain SQL
- a shipped Astro + Vue operator frontend served by `gitpulse serve`
- a Bun workspace with shared frontend contracts and a source-run terminal preview that still needs Phase 4 polish
- a manual-first ingestion flow built around add, import, rescan, and rebuild

Near-term roadmap decisions:

- stabilize the Go CLI + Astro web daily loop
- prove the local add/import/rescan/rebuild happy path end to end
- harden the SQLite-backed runtime instead of adding extra infrastructure
- complete the TUI lane only if it earns its keep
- treat packaging as optional follow-on work, not a current product surface

## Milestone 1 — operator-ready Go runtime

**Status:** In progress

Goal: make the current manual-first Go runtime comfortable to run locally every day.

Targets:

- CLI commands: `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, `doctor`
- SQLite-backed event and rollup model
- dashboard, repositories, sessions, achievements, and settings pages through the Astro + Vue frontend
- rebuilt sessions, streaks, score, and achievements logic
- operator-facing docs and reproducible local setup

Still needed:

- live local smoke verification across the main CLI flow on a real workspace
- more focused integration tests where they earn their keep
- settle whether background monitoring belongs at all after the manual-first loop is fully proven
- GitHub push verification parity where it is still worth keeping

## Milestone 2 — hardening and product usability

**Status:** Planned

Goal: make the app resilient and pleasant to operate.

Possible scope:

- more focused runtime and database tests
- better error handling and diagnostics
- explicit migration and version handling beyond the bootstrap schema
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

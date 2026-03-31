# Changelog

All notable changes to GitPulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Freeze the shipped Go + SQLite contract in `docs/rewrite/current-contract.md`, including the current CLI, API, config, schema, and operator workflow boundary.
- Define the rewrite boundary in `docs/rewrite/vnext-boundary.md`, including the planned repo layout, service topology, ports, same-origin routing, and environment contract.
- Add `docs/rewrite/sqlite-to-postgres.md` and `docs/rewrite/parity-fixtures-and-cutover.md` so the migration path, deterministic fixture plan, and cutover checklist are explicit instead of hand-waved.

### Changed
- Mark BUILD Phase 0 complete now that the current contract, migration path, parity fixtures, and cutover boundary are documented.

### Removed
- Delete the legacy `python-ui/` migration reference directory now that the Go-served Astro + Vue frontend is the only shipped browser lane.

## [0.2.0] - 2026-03-29

### Added
- Ship the Python operator UI that `gitpulse serve` launches automatically, including dashboard, repositories, repository detail, sessions, achievements, and settings surfaces.
- Add Go JSON API routes and explicit operator actions for add, import, rescan, rebuild, and settings persistence.
- Add focused SQLite integration coverage plus Python UI service and application tests.
- Default the runtime to a local SQLite database path in the platform data directory.

### Changed
- Rewrite GitPulse into the current Go-first application with a FastAPI + Jinja2 + htmx operator UI.
- Replace the storage layer with SQLite via `database/sql` and `modernc.org/sqlite`.
- Align the README, architecture notes, operator workflow, roadmap, and contributor docs with the manual-first runtime that ships today.

### Removed
- The legacy Rust workspace, Tauri desktop packaging path, and stale docs that no longer matched the shipped stack.

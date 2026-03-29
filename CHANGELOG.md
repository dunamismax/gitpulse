# Changelog

All notable changes to GitPulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

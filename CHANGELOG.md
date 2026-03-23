# Changelog

All notable changes to GitPulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Persist settings page changes to the active TOML config file and update the in-memory runtime config after save.

### Changed
- Document the repository as a Go + PostgreSQL + raw SQL + local web UI project with `BUILD.md` as the execution ledger.
- Align README, BUILD, architecture notes, and contributor docs with the current implementation.
- Tighten release and packaging docs so they only describe workflows the repo actually has.

### Removed
- The temporary handoff tracker file and stale references to it across the repo.
- Stale migration-cleanup narration from active docs.
- Outdated packaging and toolchain references that no longer describe the current repo.

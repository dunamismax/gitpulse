# Changelog

All notable changes to GitPulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Add a focused SQLite integration test for schema bootstrap and repository persistence.
- Default the runtime to a local SQLite database path in the platform data directory.

### Changed
- Replace the storage layer with SQLite via `database/sql` and `modernc.org/sqlite`.
- Convert runtime queries, migrations, config examples, and CLI diagnostics to the SQLite path model.
- Align README, BUILD, architecture notes, agent docs, roadmap, and contributor docs with the active implementation.

### Removed
- The redundant second init migration file.
- Stale storage documentation that described a different runtime than the code.

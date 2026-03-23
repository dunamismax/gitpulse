# GitPulse Implementation Tracker

This file is the resumable handoff for the current Go implementation work.

## Active target

Current stack:

- Go
- PostgreSQL
- raw SQL via `pgx/v5`
- plain HTML templates
- Cobra CLI
- `net/http` local web dashboard

## Current implementation inventory

### Done

- [x] Cobra CLI entrypoint
- [x] Config loading via Viper
- [x] PostgreSQL connection and schema bootstrap
- [x] Raw SQL repository/query layer
- [x] Repo discovery and git metadata probing
- [x] Snapshot parsing from git status + git diff
- [x] Commit history import from `git log --numstat`
- [x] Sessionization logic
- [x] Score, streak, and achievement logic
- [x] Dashboard and repository view assembly
- [x] `net/http` routes and template rendering
- [x] Docs and config examples aligned with the current Go repo truth

### In progress

- [~] Broader database-backed smoke validation
- [~] Tightening operator docs around what is implemented vs scaffold

### Not started or not finished

- [ ] Background watcher / polling loop
- [ ] Settings persistence writes from the web UI
- [ ] GitHub remote push verification parity
- [ ] Integration tests that create temporary PostgreSQL databases
- [ ] Packaged desktop release workflow if it is still worth having

## Verification actually run

- [x] `go test ./...`
- [x] `go build ./cmd/gitpulse`
- [x] `go run ./cmd/gitpulse --help`
- [x] tracked-files scan for stale toolchain and desktop-packaging references

## Known gaps and risks

- The app builds, but this pass did not run a full live PostgreSQL workflow end to end.
- `internal/db/schema.sql`, `migrations/0001_init.sql`, and `migrations/001_init.sql` duplicate baseline schema intent and must stay synchronized.
- The settings page currently displays configuration only; save is a stub redirect.
- There is no packaged desktop release workflow in-tree today.

## Next suggested chunk

1. Provision a disposable PostgreSQL database.
2. Run `serve`, `add`, `import`, `rebuild-rollups`, and `doctor` against it.
3. Add one integration test that boots the runtime against a temporary database and exercises the happy path.
4. Decide later whether packaged desktop releases are worth adding.

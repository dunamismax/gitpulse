# GitPulse Rewrite Tracker

This file is the resumable handoff for the Go rewrite now that the legacy Rust/Tauri tree has been removed.

## Active target

Current stack:

- Go
- PostgreSQL
- raw SQL via `pgx/v5`
- plain HTML templates
- Zig/C only if a thin native shell is reintroduced later

## Cutover status

### Completed on 2026-03-23

- [x] Remove the tracked Rust/Tauri workspace from `main`
- [x] Remove Cargo manifests, lockfile, Rust toolchain/config files, and Rust-era helper scripts
- [x] Rewrite docs so the repo truth is explicitly Go/PostgreSQL only
- [x] Remove Tauri-specific behavior from the remaining frontend glue
- [x] Keep CI focused on the Go path only

### Rust/Tauri material removed

- `Cargo.toml`
- `Cargo.lock`
- `apps/`
- `crates/`
- `rust-toolchain.toml`
- `rustfmt.toml`
- `clippy.toml`
- `deny.toml`
- `.cargo/`
- `.config/nextest.toml`
- `scripts/desktop-package.sh`
- `scripts/desktop-smoke.sh`
- local `target/` and `target-desktop/` directories when present

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
- [x] Docs and config examples aligned with the Go-only repo truth

### In progress

- [~] Real database-backed smoke validation of the rewrite
- [~] Tightening operator docs around what is implemented vs scaffold

### Not started or not finished

- [ ] Background watcher / polling loop
- [ ] Settings persistence writes from the web UI
- [ ] GitHub remote push verification parity
- [ ] Integration tests that create temporary PostgreSQL databases
- [ ] Zig/C native shell replacement if native packaging is still worth having

## Verification actually run

- [x] `go test ./...`
- [x] `go build ./cmd/gitpulse`
- [x] `go run ./cmd/gitpulse --help`
- [x] stale-reference scan for Rust/Cargo/Tauri terms across tracked docs/config after cleanup

## Known gaps and risks

- The rewrite builds, but this pass did not run a full live PostgreSQL workflow end to end.
- `internal/db/schema.sql` and `migrations/001_init.sql` duplicate the same baseline and must stay synchronized.
- The settings page currently displays configuration only; save is a stub redirect.
- There is no native desktop shell in-tree today; do not imply packaging or release support that does not exist.

## Next suggested chunk

1. Provision a disposable PostgreSQL database.
2. Run `serve`, `add`, `import`, `rebuild-rollups`, and `doctor` against it.
3. Add one integration test that boots the runtime against a temporary database and exercises the happy path.
4. Decide whether a Zig/C shell is worth reintroducing before creating any new desktop packaging work.

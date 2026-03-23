# GitPulse Rewrite Tracker

This file is the resumable handoff for the Rust-to-Go recovery rewrite.

## Rewrite target

Active target stack:

- Go
- PostgreSQL
- raw SQL via `pgx/v5`
- plain HTML templates
- Zig/C only if and when a thin native shell is reintroduced

Legacy Rust code remains in the repo only as migration reference.

## Recovery status

### Rescued on 2026-03-23

Primary rescue source:

- `.claude/worktrees/awesome-shirley`

Recovered into `main`:

- `go.mod`
- `cmd/gitpulse/main.go`
- `internal/config/`
- `internal/db/`
- `internal/filter/`
- `internal/git/`
- `internal/metrics/`
- `internal/models/`
- `internal/runtime/`
- `internal/sessions/`
- `internal/web/`
- `templates/`
- `migrations/001_init.sql`

Inspected but not used:

- `.claire/worktrees/awesome-shirley/internal/db/snapshots.go` was an incomplete stub
- `.claire/worktrees/serene-hawking` had no recoverable files

Cleanup completed:

- `.claude/` and `.claire/` were moved to Trash after rescue

### Post-rescue fixes completed

- [x] Generate `go.sum` and module metadata with `go mod tidy`
- [x] Fix `internal/git/git.go` type mismatch around touched paths
- [x] Fix `internal/runtime/runtime.go` unused variable
- [x] Add missing `Runtime.ListRepos` and `Runtime.FindRepo` wrappers
- [x] Rewrite `README.md`, `BUILD.md`, `AGENTS.md`, and `docs/architecture.md`
- [x] Update `gitpulse.example.toml` for the Go config surface
- [x] Update CI to validate the Go path instead of the legacy Rust workflow

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
- [x] net/http routes and template rendering
- [x] HTML templates rescued into the main tree

### In progress

- [~] Real database-backed smoke validation of the rewrite
- [~] Documentation alignment around the Go rewrite and migration plan

### Not started or not finished

- [ ] Background watcher / polling loop
- [ ] Settings persistence writes from the web UI
- [ ] GitHub remote push verification parity
- [ ] Integration tests that create temporary PostgreSQL databases
- [ ] Zig/C native shell replacement for the old desktop app
- [ ] Removal of the legacy Rust workspace after parity is acceptable

## Verification actually run

- [x] `go mod tidy`
- [x] `go test ./...`
- [x] `go run ./cmd/gitpulse --help`

## Known gaps and risks

- The rewrite builds, but this pass did not run a full live PostgreSQL workflow end to end.
- The legacy Rust tree still exists and can mislead contributors if they skip `BUILD.md` and `README.md`.
- `internal/db/schema.sql` and `migrations/001_init.sql` duplicate the same baseline and must stay synchronized.
- The settings page currently displays configuration only; save is a stub redirect.

## Next suggested chunk

1. Provision a disposable PostgreSQL database.
2. Run `serve`, `add`, `import`, `rebuild-rollups`, and `doctor` against it.
3. Add one integration test that boots the runtime against a temporary database and exercises the happy path.
4. Start quarantining or deleting legacy Rust files once the Go happy path is proven.

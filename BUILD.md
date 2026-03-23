# BUILD.md

## Purpose

This is the execution manual for the GitPulse rewrite.

Use it to answer four things quickly:

- what the active codepath is
- what was removed or verified in the latest pass
- what still blocks an operator-ready workflow
- what the next sensible implementation step should be

If code and docs disagree, fix both in the same change.

---

## Mission

Ship a local-first git analytics tool that tracks repository activity without uploading source code.

Product rules that still matter during the rewrite:

- live work, committed work, and pushed work remain separate ledgers
- all persisted state stays local
- PostgreSQL is the source of truth for persisted data
- raw SQL stays explicit and inspectable
- CLI and local web UI share one runtime
- any future native shell should be thin and built with Zig/C

---

## Current repo snapshot

Last reviewed: 2026-03-23
Branch: `main`
Host used for this pass: macOS

### Active implementation path

The active implementation lives in:

- `go.mod`
- `cmd/gitpulse/`
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
- `assets/`
- `migrations/001_init.sql`

### Legacy removal status

Rust/Tauri migration cleanup is complete for the repo tree.

Removed in this pass:

- workspace and crate manifests: `Cargo.toml`, `Cargo.lock`, `apps/`, `crates/`
- toolchain/config files: `rust-toolchain.toml`, `rustfmt.toml`, `clippy.toml`, `deny.toml`, `.cargo/`, `.config/nextest.toml`
- Rust-era helper scripts: `scripts/desktop-package.sh`, `scripts/desktop-smoke.sh`
- local Rust build output when present: `target/`, `target-desktop/`

Nothing in the tracked tree should now imply a working Rust or Tauri path.

### Rewrite status

**Current phase: Rust removed, Go rewrite remains functional but not feature-complete.**

What is done in the Go path:

- Cobra CLI with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- layered config loading and platform path discovery
- PostgreSQL connection, embedded schema, and raw SQL query files
- git subprocess helpers for repo discovery, snapshot parsing, and history import
- analytics rebuild flow for sessions, rollups, streaks, score, and achievements
- `net/http` server with page handlers and template rendering
- local HTML templates and shared static assets

What is not done yet:

- repeatable live PostgreSQL smoke coverage beyond compile/test/help checks
- continuous watcher / background monitoring loop
- settings persistence writes from the web UI
- any Zig/C native shell or packaging path

---

## Source-of-truth map

| File | Owns |
|------|------|
| `BUILD.md` | execution truth, verification log, next steps |
| `REWRITE_TRACKER.md` | rewrite checklist and resumable handoff state |
| `README.md` | public-facing project status and local run instructions |
| `AGENTS.md` | concise repo memory for future agents |
| `docs/architecture.md` | active Go architecture |
| `gitpulse.example.toml` | config surface for the Go runtime |
| `internal/db/schema.sql` | embedded startup schema |
| `migrations/001_init.sql` | explicit PostgreSQL migration baseline |
| `.github/workflows/ci.yml` | automated validation for the active Go path |

---

## Build and run workflow

### Prerequisites

- Go 1.25+
- Git 2.30+
- PostgreSQL 14+

### Local config

Default config paths:

- macOS: `~/Library/Application Support/gitpulse/gitpulse.toml`
- Linux: `~/.config/gitpulse/gitpulse.toml`
- Windows: `%APPDATA%\gitpulse\gitpulse.toml`

Minimum config:

```toml
[database]
dsn = "postgres://localhost/gitpulse?sslmode=disable"
```

### Local commands

```bash
createdb gitpulse
go test ./...
go run ./cmd/gitpulse serve
go run ./cmd/gitpulse add /path/to/repo-or-folder
go run ./cmd/gitpulse import --all --days 30
go run ./cmd/gitpulse rescan --all
go run ./cmd/gitpulse rebuild-rollups
go run ./cmd/gitpulse doctor
```

### CI commands

```bash
go test ./...
go build ./cmd/gitpulse
```

---

## Verification log

Only record commands that actually passed.

### Verified on 2026-03-23

- `go test ./...`
- `go build ./cmd/gitpulse`
- `go run ./cmd/gitpulse --help`
- `rg -n --hidden --glob '!.git' '(?i)\b(rust|cargo|tauri|clippy|nextest|rustfmt|rust-toolchain)\b'` over tracked docs/config after cleanup

### Not yet re-verified in this pass

- full add/import/rescan/rebuild workflow against a live PostgreSQL database
- web route smoke against a running local server
- any future Zig/C shell work

---

## Phase board

### Phase 0 — rescue and stabilization

- **done** rescue viable Go rewrite files from leftover worktree directories
- **done** make the rescued Go tree compile cleanly
- **done** rewrite top-level docs around the active Go/PostgreSQL architecture
- **done** restore CI to validate the active Go path

### Phase 1 — stack cleanup

- **done** remove the legacy Rust/Tauri workspace and Rust toolchain files from the repo
- **done** rewrite README, build docs, tracker docs, and architecture notes so the repo truth is Go-only
- **done** remove Rust-era helper scripts and config clutter

### Phase 2 — operator-ready local workflow

- **in progress** validate real PostgreSQL startup, add, import, rescan, and rebuild flows
- **not started** add focused integration tests around DB-backed runtime behavior
- **not started** improve config validation and operator-facing error messages

### Phase 3 — product parity and hardening

- **in progress** dashboard, repository detail, sessions, achievements, and settings routes exist in the Go tree
- **not started** continuous watcher / polling loop
- **not started** GitHub remote verification parity where it is still worth keeping
- **not started** full settings persistence from the web layer

### Phase 4 — optional native shell

- **not started** prove whether native packaging is still worth carrying at all
- **not started** add a thin Zig/C shell if it earns its keep
- **not started** define a real release workflow for any future native artifact

---

## Decisions

- 2026-03-23: The repo truth is now Go + PostgreSQL + raw SQL only; the legacy Rust/Tauri tree is removed.
- 2026-03-23: Keep top-level docs honest about scaffold/TODO areas instead of implying shipped parity that has not been re-verified.
- 2026-03-23: Any future native wrapper work should be Zig/C based, with the web/runtime stack remaining the product core.

---

## Risks

- The Go path compiles and tests, but the end-to-end DB workflow still needs live verification.
- `internal/db/schema.sql` and `migrations/001_init.sql` must remain aligned until a real migration runner history exists.
- The web settings form currently displays configuration only; save is a stub redirect.
- A future native-shell decision is intentionally unresolved; do not imply desktop packaging exists until code and release tooling actually land.

---

## Next best moves

1. Run a live PostgreSQL-backed smoke path: `serve`, `add`, `import`, `rebuild-rollups`, `doctor`.
2. Add a small integration test harness that provisions a temporary database and exercises the runtime.
3. Implement or intentionally defer the background monitoring loop with explicit docs.
4. Decide whether a Zig/C shell is worth building at all before adding any desktop-release machinery back.

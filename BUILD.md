# BUILD.md

## Purpose

This is the execution manual for GitPulse.

Use it to answer four things quickly:

- what the active runtime is
- what is actually implemented today
- what work is still materially unfinished
- what the next build-worthy move should be

If code and docs disagree, fix both in the same change.

---

## Mission

Ship a local-first git activity tool that gives an individual operator honest signals about their work without uploading source code.

Product rules that stay locked unless the architecture really changes:

- live work, committed work, and pushed work stay separate ledgers
- all persisted state stays local by default
- relational data stays the default
- SQLite is the active storage layer
- Go owns persistence and orchestration
- the React SPA is an operator surface, not the system of record
- plain SQL stays explicit and inspectable unless backend complexity later earns `sqlc`
- CLI and local web UI remain one runtime, not two drifting products

---

## Repo snapshot

Last reviewed: 2026-03-24
Branch: `main`
Host used for this pass: macOS

### Active implementation path

The current shipping path lives in:

- `go.mod`
- `cmd/gitpulse/`
- `web/`
- `internal/config/`
- `internal/db/`
- `internal/filter/`
- `internal/git/`
- `internal/metrics/`
- `internal/models/`
- `internal/runtime/`
- `internal/sessions/`
- `internal/web/`
- `migrations/`

### What exists today

Implemented and repo-visible right now:

- Cobra CLI with `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`
- SQLite connection setup, embedded schema, repo-visible migration file, and plain SQL query layer
- git subprocess integration for repo discovery, snapshot parsing, commit history import, and push-related data capture paths
- rebuildable sessions, streaks, score, rollups, and achievements logic in Go
- `net/http` JSON API routes for dashboard, repositories, repository detail, sessions, achievements, and settings
- Bun + TypeScript + React + Vite SPA with TanStack Router, TanStack Query, Tailwind CSS, and Biome
- Go runtime serving the built SPA from `web/dist` with client-side routing fallback
- settings writes back to the active TOML config surface through the Go runtime
- CI coverage for Go test/vet/build/lint/vuln checks plus web check/test/build

### What is still not done

Real unfinished work, not hand-wavy future dreaming:

- the main operator flow is not yet captured as a reproducible end-to-end local smoke path inside the repo
- there is no settled watcher/background monitoring story yet
- the browser/operator surface still needs more hardening around empty states, progress visibility, and error handling
- packaging/distribution remains undecided and intentionally non-core

### Current build posture

GitPulse is active, usable, and worth extending, but it is not done.

The repo is past the stack-churn phase. The highest-value work is now proving the daily local workflow, hardening the operator experience, and making the ingestion story intentional instead of implicit.

---

## Source-of-truth mapping

| File | Owns |
|------|------|
| `BUILD.md` | execution truth, verification ledger, live work board |
| `README.md` | public-facing status and local run instructions |
| `ROADMAP.md` | product direction beyond the immediate execution lane |
| `AGENTS.md` | concise repo memory and working rules |
| `docs/architecture.md` | active Go + SPA architecture |
| `gitpulse.example.toml` | config surface for the Go runtime |
| `internal/db/schema.sql` | embedded startup schema |
| `migrations/` | repo-visible SQLite migration history |
| `.github/workflows/ci.yml` | automated validation for the current Go + web path |

---

## Build / run / verify

### Prerequisites

- Go 1.26.1
- Bun 1.1+
- Git 2.30+

### Local config

The runtime defaults to a SQLite file in the platform data directory. A config file is optional.

Default config paths:

- macOS: `~/Library/Application Support/gitpulse/gitpulse.toml`
- Linux: `~/.config/gitpulse/gitpulse.toml`
- Windows: `%APPDATA%\gitpulse\gitpulse.toml`

Default database paths:

- macOS: `~/Library/Application Support/gitpulse/data/gitpulse.db`
- Linux: `~/.config/gitpulse/data/gitpulse.db`
- Windows: `%APPDATA%\gitpulse\data\gitpulse.db`

Minimum optional config:

```toml
[database]
path = "/absolute/path/to/gitpulse.db"
```

### Local commands

```bash
cd web && bun install && bun run build
cd ..
go test ./...
go run ./cmd/gitpulse serve
go run ./cmd/gitpulse add /path/to/repo-or-folder
go run ./cmd/gitpulse import --all --days 30
go run ./cmd/gitpulse rescan --all
go run ./cmd/gitpulse rebuild-rollups
go run ./cmd/gitpulse doctor
```

### Frontend-only development

```bash
cd web
bun install
bun run dev
bun run build
```

### CI commands currently enforced

```bash
go test ./...
go vet ./...
go build ./cmd/gitpulse
golangci-lint run
govulncheck ./...
cd web && bun install --frozen-lockfile && bun run check && bun run test && bun run build
```

---

## Verification ledger

Only record commands that actually passed.

### Verified on 2026-03-24

- `cd web && bun run build`
- `go test ./internal/web ./cmd/gitpulse/...`
- `cd web && bun run check`
- `cd web && bun run test`
- `go test ./...`
- `go build ./cmd/gitpulse`

### Previously verified on 2026-03-23

- `cd web && bun run build`
- `go mod tidy`
- `go test ./...`
- `go build ./cmd/gitpulse`
- `go run ./cmd/gitpulse --help`
- `go run ./cmd/gitpulse doctor`
- `go test ./internal/... ./cmd/gitpulse/...`

### Still not re-verified in this pass

- a full local operator loop: `serve` + `add` + `import` + `rescan` + `rebuild-rollups` + `doctor` against a temp or seeded workspace

---

## Active work board

These are ordered workstreams, not a fake finished roadmap.

### Workstream 1 — prove the daily operator loop

**Status:** active / highest priority

Why this matters:

The codebase already has the core runtime and UI. The next credibility jump is proving that a fresh local operator can build, start, add repositories, import history, rescan, rebuild analytics, and inspect results without undocumented handholding.

Checklist:

- [ ] capture one reproducible smoke workflow that exercises `serve`, `add`, `import`, `rescan`, `rebuild-rollups`, and `doctor`
- [ ] choose a fixture strategy: tiny seeded git repo, temp repo generator, or both
- [ ] assert something durable at the end of the flow: DB rows, JSON API output, or both
- [ ] document the expected operator-visible outcomes of that run
- [ ] keep the smoke path cheap enough to run routinely in local development

Exit criteria:

- one end-to-end happy path is repeatable from a clean machine state
- failures in the main ingest/rebuild lane become easier to reproduce than to debate

### Workstream 2 — settle the ingestion model

**Status:** active / design decision pending

Why this matters:

GitPulse currently has strong manual commands, but the product story is still blurry unless the repo clearly decides whether activity capture is manual-first, poll-based, or watcher-based.

Checklist:

- [ ] decide whether v1 is explicit-manual, periodic polling, filesystem watcher, or a staged combination
- [ ] if watcher/poller work is deferred, document that deferment plainly so the UI and docs do not imply automatic tracking that does not exist
- [ ] if background capture is pursued, define bounds first: scan cadence, debouncing, repo count expectations, and failure visibility
- [ ] specify how background work interacts with imports, rescans, and rebuilds without corrupting operator expectations
- [ ] decide whether pushed-work verification stays local-only or grows remote checks where justified

Exit criteria:

- the docs and UI tell the same truth about how new activity appears in GitPulse
- the ingestion model is intentional rather than assumed

### Workstream 3 — harden the operator surface

**Status:** active

Why this matters:

The dashboard exists, but operator trust is won in the awkward moments: empty databases, long imports, bad config, giant repos, and partial failures.

Checklist:

- [ ] tighten config validation and operator-facing error messages
- [ ] improve empty states for a fresh database with no tracked repos
- [ ] surface progress, last-run timestamps, or other freshness signals for rescan/import/rebuild actions
- [ ] verify settings writes are predictable, atomic, and clearly reflected back into the UI
- [ ] review the repository detail and sessions views for places where derived analytics need clearer explanation

Exit criteria:

- a new local operator can tell what happened, what failed, and what to do next without reading the source

### Workstream 4 — keep the runtime honest under load

**Status:** active

Why this matters:

The stack direction is now stable enough to spend effort on confidence-building tests instead of more stack migration churn.

Checklist:

- [x] CI runs Go test, vet, build, `golangci-lint`, and `govulncheck`
- [x] CI runs web check, test, and build
- [ ] extend table-driven tests around git parsing helpers in `internal/git/`
- [ ] add fuzz coverage for git subprocess output parsing in `internal/git/`
- [ ] add focused runtime/database tests for flows that mutate persisted state
- [ ] decide whether admin-only observability surfaces like `/metrics` and `pprof` are worth carrying before a daemon/background story exists

Exit criteria:

- the risky parsing and persistence edges are covered better than they are today
- quality work tracks the real failure modes of this repo, not generic checklist theater

### Workstream 5 — keep packaging optional until earned

**Status:** planned / intentionally not current gate

Why this matters:

Shipping a desktop wrapper or installer before the local runtime is operator-solid would create more surface area than value.

Checklist:

- [ ] decide whether packaged desktop releases belong in the first real release at all
- [ ] if yes, write down the minimum acceptable release workflow and support burden
- [ ] if no, keep `go run`/binary + browser dashboard as the explicit product story for now

Exit criteria:

- packaging is either deliberately deferred or justified by actual operator pain, not ambition drift

---

## Decisions already made

These should be treated as current operating truth, not open brainstorming:

- GitPulse is local-first
- SQLite is the default and implemented database
- Go owns persistence and runtime orchestration
- plain SQL is the data access approach today
- the browser UI is React + Vite under `web/`
- the Go server serves the built SPA
- packaging is optional, not part of the current done definition

## Decisions that still need a call

These are the real judgment points still hanging over the repo:

- watcher vs poller vs manual-first ingestion for v1
- how much push verification or remote-state parity is actually worth carrying
- whether a schema/version story beyond bootstrap + migration file needs to move up in priority
- whether observability endpoints belong before a background service mode exists
- whether desktop packaging is a real product need or just tempting scope

---

## Risks and constraints

- The biggest product risk is not stack mismatch anymore; it is ambiguity in the operator workflow.
- A watcher/background loop can easily become complexity bait if it lands before the manual workflow is deeply verified.
- The React UI can create false confidence if it suggests freshness or automation the runtime does not yet guarantee.
- Packaging too early would multiply support burden while the core loop is still settling.
- Because analytics are rebuildable, the repo should prefer deterministic raw event capture and explicit rebuild flows over magical hidden state.

---

## Immediate next moves

If only one substantial thing gets done next, make it this:

1. create a cheap seeded local smoke path for `add` + `import` + `rescan` + `rebuild-rollups`
2. verify the result through the SQLite database and one JSON endpoint
3. document the expected output and failure modes in-repo
4. only then decide whether background watching changes the product enough to earn immediate implementation

That sequence tightens truth, improves confidence, and informs the watcher decision with evidence instead of vibes.

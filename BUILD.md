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
- browser surfaces are operator UIs, not the system of record
- plain SQL stays explicit and inspectable unless backend complexity later earns `sqlc`
- the Go runtime remains the source of truth while the Python UI owns the browser surface
- CLI and local web UI remain one product

---

## Repo snapshot

Last reviewed: 2026-03-27 (frontend cutover complete, React/Bun removed)
Branch: `main`
Host used for this pass: macOS

### Active implementation path

The current shipping path lives in:

- `go.mod`
- `cmd/gitpulse/`
- `python-ui/`
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
- FastAPI + Jinja2 + htmx Python UI under `python-ui/`
- vendored local Alpine.js and htmx assets in the Python UI, replacing CDN dependency at runtime
- actionable Python UI recovery guidance when the configured Go API base URL is unreachable or returns unreadable transport responses
- Python UI freshness visibility for repository snapshot timing, repo update timing, and recent push events via existing Go API fields
- settings writes back to the active TOML config surface through the Go runtime
- Python UI first-run guidance across dashboard, repositories, repository detail, sessions, achievements, and settings
- Python UI operator runbook controls for import, rescan, and rebuild with inline long-running feedback and Go-backed action summaries
- `gitpulse serve` launching the Python UI as a managed subprocess on an internal loopback port
- Go reverse proxying non-API browser requests to the Python UI while serving `/api/*` directly
- CI coverage for Go test/vet/build/lint/vuln checks plus Python UI lint/format/type/test checks

### What is still not done

Real unfinished work, not hand-wavy future dreaming:

- there is no settled watcher/background monitoring story yet
- packaging/distribution remains undecided and intentionally non-core
- fuzz coverage for git subprocess parsing is not yet implemented
- a real-workspace live smoke beyond the seeded test repo is still worth carrying out manually from time to time

### Current build posture

GitPulse is active, usable, and worth extending, but it is not done.

The React/Bun lane is gone. The Python UI is now the default operator surface, and the remaining frontend work is normal product iteration rather than dual-stack migration. The operator workflow (add → import → rescan → rebuild → inspect) is covered by the Go smoke test plus Python UI page/action tests.

The highest-value work is now settling the ingestion model (Workstream 2), deciding how much live/background monitoring belongs in v1, and deciding whether fuzz coverage for git parsing is worth the investment.

---

## Source-of-truth mapping

| File | Owns |
|------|------|
| `BUILD.md` | execution truth, verification ledger, live work board |
| `README.md` | public-facing status and local run instructions |
| `ROADMAP.md` | product direction beyond the immediate execution lane |
| `AGENTS.md` | concise repo memory and working rules |
| `docs/architecture.md` | active Go runtime + Python UI architecture |
| `python-ui/README.md` | Python UI run and verify instructions |
| `gitpulse.example.toml` | config surface for the Go runtime |
| `internal/db/schema.sql` | embedded startup schema |
| `migrations/` | repo-visible SQLite migration history |
| `.github/workflows/ci.yml` | automated validation for the current Go + Python UI path |

---

## Build / run / verify

### Prerequisites

- Go 1.26.1
- Python 3.14+ and `uv`
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
# Main product path
go test ./...
go run ./cmd/gitpulse serve

# Core operator commands
go run ./cmd/gitpulse add /path/to/repo-or-folder
go run ./cmd/gitpulse import --all --days 30
go run ./cmd/gitpulse rescan --all
go run ./cmd/gitpulse rebuild-rollups
go run ./cmd/gitpulse doctor

# Python UI standalone development
cd python-ui
uv sync
uv run gitpulse-ui
```

### CI commands currently enforced

```bash
go test ./...
go vet ./...
go build ./cmd/gitpulse
golangci-lint run
govulncheck ./...
cd python-ui && uv sync && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
```

### Python UI local verification commands

```bash
cd python-ui
uv sync
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

---

## Verification ledger

Only record commands that actually passed.

### Verified on 2026-03-27 (frontend cutover + React/Bun removal)

- `gofmt -w cmd/gitpulse/main.go cmd/gitpulse/python_ui.go internal/web/server.go internal/web/server_test.go internal/runtime/smoke_test.go` — passes
- `go test ./internal/web ./internal/runtime ./cmd/gitpulse` — passes
- `go test ./...` — passes
- `go vet ./...` — passes
- `go build ./cmd/gitpulse` — passes
- `cd python-ui && uv sync` — passes
- `cd python-ui && uv run ruff check .` — passes
- `cd python-ui && uv run ruff format --check .` — passes
- `cd python-ui && uv run pyright` — passes
- `cd python-ui && uv run pytest` — 12 tests pass
- `port=7489; tmp_db=$(mktemp -t gitpulse-serve-db); GITPULSE_DATABASE__PATH="$tmp_db" go run ./cmd/gitpulse serve --port "$port"` launched successfully in a background session; `curl --max-time 5 -fsS http://127.0.0.1:$port/` returned the first-run dashboard HTML; `curl --max-time 5 -fsS http://127.0.0.1:$port/api/dashboard | jq '.summary.today_score'` returned `0`; server then shut down cleanly — passes

New verified coverage added in this pass:

- `internal/web/server_test.go` — browser requests are proxied to the Python UI handler while `/api/*` stays in Go
- `internal/web/server_test.go` — non-API form posts forward to the Python UI handler
- `internal/runtime/smoke_test.go` — smoke path now validates the Go API without needing a built SPA directory

### Previously verified on 2026-03-27 (frontend rewrite checkpoint 3)

- `cd python-ui && uv run ruff check .` — passes
- `cd python-ui && uv run ruff format --check .` — passes
- `cd python-ui && uv run pyright` — passes
- `cd python-ui && uv run pytest` — 12 tests pass
- `gofmt -w internal/models/models.go internal/web/handlers_api.go internal/web/server.go && go test ./... && go build ./cmd/gitpulse` — passes

### Previously verified on 2026-03-24

- `go test ./... -count=1` — all packages pass including smoke and git parsing tests
- `go build ./cmd/gitpulse`
- `go vet ./...`
- `go run ./cmd/gitpulse --help`
- `go run ./cmd/gitpulse doctor`

---

## Active work board

These are ordered workstreams, not a fake finished roadmap.

### Workstream 1 — prove the daily operator loop

**Status:** active / mostly met

Why this matters:

The codebase already has the core runtime and UI. The next credibility jump is proving that a fresh local operator can build, start, add repositories, import history, rescan, rebuild analytics, and inspect results without undocumented handholding.

Checklist:

- [x] capture one reproducible smoke workflow that exercises `serve`, `add`, `import`, `rescan`, `rebuild-rollups`, and `doctor`
- [x] choose a fixture strategy: tiny seeded git repo, temp repo generator, or both
- [x] assert something durable at the end of the flow: DB rows, JSON API output, or both
- [x] document the expected operator-visible outcomes of that run
- [x] keep the smoke path cheap enough to run routinely in local development
- [ ] re-run the full loop against a real working code directory from time to time, not just seeded temp repos

Exit criteria:

- one end-to-end happy path is repeatable from a clean machine state
- failures in the main ingest/rebuild lane become easier to reproduce than to debate

### Workstream 2 — settle the ingestion model

**Status:** active / design decision pending

Why this matters:

GitPulse currently has strong manual commands, but the product story is still blurry unless the repo clearly decides whether activity capture is manual-first, poll-based, watcher-based, or staged.

Checklist:

- [ ] decide whether v1 is explicit-manual, periodic polling, filesystem watcher, or a staged combination
- [ ] if watcher/poller work is deferred, document that deferment plainly so the UI does not imply automatic capture that does not exist
- [ ] if background capture is pursued, define bounds first: scan cadence, debouncing, repo count expectations, and failure visibility
- [ ] specify how background work interacts with imports, rescans, and rebuilds without corrupting operator expectations
- [ ] decide whether pushed-work verification stays local-only or grows remote checks where justified

Exit criteria:

- the docs and UI tell the same truth about how new activity appears in GitPulse
- the ingestion model is intentional rather than assumed

### Workstream 3 — keep the Python operator surface the default and only browser lane

**Status:** active / core cutover met

Why this matters:

The frontend direction is no longer ambiguous. The job now is keeping the Python operator UI clean, verified, and honest without reintroducing frontend drift.

Checklist:

- [x] make `gitpulse serve` land on the Python UI by default
- [x] keep the Go backend and JSON API as the source of truth
- [x] remove the React/Bun frontend lane from the repo
- [x] update CI and docs to describe only the Python UI path
- [x] add Go-side coverage for API-vs-UI routing behavior
- [ ] decide whether the managed subprocess model is the long-term serving topology or just the cleanest current checkpoint

Exit criteria:

- the operator sees one supported browser surface
- repo docs, CI, and source tree all describe the same serving story

### Workstream 4 — keep the runtime honest under load

**Status:** active

Why this matters:

The stack direction is now stable enough to spend effort on confidence-building tests instead of more stack migration churn.

Checklist:

- [x] CI runs Go test, vet, build, `golangci-lint`, and `govulncheck`
- [x] CI runs Python UI lint, format, type, and test checks
- [x] extend table-driven tests around git parsing helpers in `internal/git/`
- [x] add focused runtime/database tests for flows that mutate persisted state
- [ ] add fuzz coverage for git subprocess output parsing in `internal/git/`
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
- the Python UI under `python-ui/` is the only supported browser surface
- `gitpulse serve` launches that Python UI on an internal loopback port and proxies browser requests to it
- the Go JSON API remains the source of truth for the browser UI
- React/Bun has been fully removed from the repo
- packaging is optional, not part of the current done definition

## Decisions that still need a call

These are the real judgment points still hanging over the repo:

- watcher vs poller vs manual-first ingestion for v1
- how much push verification or remote-state parity is actually worth carrying
- whether a schema/version story beyond bootstrap + migration file needs to move up in priority
- whether observability endpoints belong before a background service mode exists
- whether the managed Python subprocess + reverse proxy should remain the long-term serving model or later collapse into a different topology
- whether desktop packaging is a real product need or just tempting scope

---

## Risks and constraints

- The biggest product risk is ambiguity in the operator workflow, not frontend stack drift.
- A watcher/background loop can easily become complexity bait if it lands before the manual workflow is deeply verified.
- Packaging too early would multiply support burden while the core loop is still settling.
- Because analytics are rebuildable, the repo should prefer deterministic raw event capture and explicit rebuild flows over magical hidden state.
- The managed Python UI subprocess depends on a working local Python + `uv` toolchain. That is acceptable for the current self-hosted developer target, but it is still an operational dependency worth revisiting if packaging ever becomes a goal.

---

## Immediate next moves

If only one substantial thing gets done next, make it this:

1. decide whether v1 ingestion is explicit-manual, periodic polling, or watcher-based (Workstream 2)
2. if watcher/poller is deferred, update the UI and docs to not imply automatic tracking
3. optionally add fuzz testing for git parsing (Workstream 4)
4. decide whether the managed Python subprocess is the final serving topology or just the cleanest current checkpoint

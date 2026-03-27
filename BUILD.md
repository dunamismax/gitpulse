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
- the Go runtime remains the source of truth while the frontend transitions from React to Python
- CLI and local web UI remain one product, even if the transition temporarily uses two UI implementations

---

## Repo snapshot

Last reviewed: 2026-03-27 (frontend rewrite checkpoint 3 — Python UI first-run + action feedback)
Branch: `main`
Host used for this pass: macOS

### Active implementation path

The current shipping path lives in:

- `go.mod`
- `cmd/gitpulse/`
- `web/`
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
- Bun + TypeScript + React + Vite SPA with TanStack Router, TanStack Query, Tailwind CSS, and Biome
- FastAPI + Jinja2 + htmx Python UI companion under `python-ui/`, backed by the existing Go JSON API
- Go runtime serving the built SPA from `web/dist` with client-side routing fallback
- Python UI pages for dashboard, repositories, repository detail, sessions, achievements, and settings
- vendored local Alpine.js and htmx assets in the Python UI, replacing CDN dependency at runtime
- actionable Python UI recovery guidance when the configured Go API base URL is unreachable or returns unreadable transport responses
- Python UI freshness visibility for repository snapshot timing, repo update timing, and recent push events via existing Go API fields
- settings writes back to the active TOML config surface through both UI lanes via the Go runtime
- Python UI first-run guidance now spans dashboard, repositories, repository detail, sessions, achievements, and settings
- Python UI operator runbook controls now expose import, rescan, and rebuild with inline long-running feedback and Go-backed action summaries
- additive Go API endpoints now expose import/rescan/rebuild action results for the Python UI without changing the Go runtime as source of truth
- CI coverage for Go test/vet/build/lint/vuln checks plus web check/test/build

### What is still not done

Real unfinished work, not hand-wavy future dreaming:

- there is no settled watcher/background monitoring story yet
- the Python rewrite lane is now close to operator-surface parity, but it still cannot replace the React SPA as the default served frontend yet
- the remaining frontend-transition blocker is delivery: `gitpulse serve` still serves the built React SPA, while the Python UI still requires a separate FastAPI process
- packaging/distribution remains undecided and intentionally non-core
- fuzz coverage for git subprocess parsing is not yet implemented

### Current build posture

GitPulse is active, usable, and worth extending, but it is not done.

The repo is past the stack-churn phase and now past the "prove the daily loop" phase. The operator workflow (add → import → rescan → rebuild → inspect) is captured as a reproducible smoke test that runs in ~1s. Git parsing helpers have solid table-driven test coverage.

The highest-value work is now settling the ingestion model (Workstream 2), deciding the exact cutover bar for making the Python UI the default served frontend (Workstream 3), and deciding whether fuzz coverage for git parsing is worth the investment.

---

## Source-of-truth mapping

| File | Owns |
|------|------|
| `BUILD.md` | execution truth, verification ledger, live work board |
| `README.md` | public-facing status and local run instructions |
| `ROADMAP.md` | product direction beyond the immediate execution lane |
| `AGENTS.md` | concise repo memory and working rules |
| `docs/architecture.md` | active Go runtime + dual-frontend transition architecture |
| `python-ui/README.md` | Python UI checkpoint run and verify instructions |
| `gitpulse.example.toml` | config surface for the Go runtime |
| `internal/db/schema.sql` | embedded startup schema |
| `migrations/` | repo-visible SQLite migration history |
| `.github/workflows/ci.yml` | automated validation for the current Go + web path |

---

## Build / run / verify

### Prerequisites

- Go 1.26.1
- Bun 1.1+ for the current React SPA
- Python 3.14+ and `uv` for the Python rewrite lane
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
# Current shipping React dashboard
cd web && bun install && bun run build
cd ..
go test ./...
go run ./cmd/gitpulse serve

# Core operator commands
go run ./cmd/gitpulse add /path/to/repo-or-folder
go run ./cmd/gitpulse import --all --days 30
go run ./cmd/gitpulse rescan --all
go run ./cmd/gitpulse rebuild-rollups
go run ./cmd/gitpulse doctor

# Python UI rewrite lane (run while the Go server is serving the API)
cd python-ui
uv sync
uv run gitpulse-ui
```

### Frontend-only development

```bash
# Current React lane
cd web
bun install
bun run dev
bun run build

# Python rewrite lane
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
cd web && bun install --frozen-lockfile && bun run check && bun run test && bun run build
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

### Verified on 2026-03-27 (frontend rewrite checkpoint 3)

- `cd python-ui && uv run ruff check .` — passes
- `cd python-ui && uv run ruff format --check .` — passes
- `cd python-ui && uv run pyright` — passes
- `cd python-ui && uv run pytest` — 12 tests pass
- `gofmt -w internal/models/models.go internal/web/handlers_api.go internal/web/server.go && go test ./... && go build ./cmd/gitpulse` — passes

New verified frontend transition coverage added in this pass:

- `python-ui/tests/test_app.py` — dashboard/repositories render the operator runbook controls
- `python-ui/tests/test_app.py` — first-run empty states render actionable guidance across dashboard, repositories, sessions, achievements, and repo detail
- `python-ui/tests/test_app.py` — htmx import action returns inline completion feedback
- `python-ui/tests/test_app.py` — repository detail import posts the requested import window and redirects with flash feedback

### Verified on 2026-03-27 (frontend rewrite checkpoint 2)

- `cd python-ui && uv sync` — passes
- `cd python-ui && uv run ruff check .` — passes
- `cd python-ui && uv run ruff format --check .` — passes
- `cd python-ui && uv run pyright` — passes
- `cd python-ui && uv run pytest` — 9 tests pass
- `go test ./... && go build ./cmd/gitpulse` — passes

New verified frontend rewrite coverage added in this pass:

- `python-ui/tests/test_app.py` — dashboard renders localized asset paths and freshness metadata
- `python-ui/tests/test_app.py` — backend-unavailable dashboard guidance includes base URL and recovery steps
- `python-ui/tests/test_app.py` — repository detail renders recent push visibility from the existing Go API payload
- `python-ui/tests/test_service.py` — connect errors become actionable backend-unavailable failures
- `python-ui/tests/test_service.py` — unreadable backend payloads become explicit transport-response failures

### Verified on 2026-03-27 (frontend rewrite checkpoint 1)

- `cd python-ui && uv sync && uv run ruff check .` — passes
- `cd python-ui && uv run ruff format --check .` — passes
- `cd python-ui && uv run pyright` — passes
- `cd python-ui && uv run pytest` — 6 tests pass
- `go test ./...` — passes after the Python UI lane was added
- `go build ./cmd/gitpulse` — passes after the Python UI lane was added

New verified frontend rewrite coverage added in this pass:

- `python-ui/tests/test_app.py` — dashboard rendering
- `python-ui/tests/test_app.py` — repositories page rendering
- `python-ui/tests/test_app.py` — htmx add-target repository section update
- `python-ui/tests/test_app.py` — repository detail rendering and pattern form presence
- `python-ui/tests/test_app.py` — settings POST forwarding and redirect behavior
- `python-ui/tests/test_app.py` — sessions and achievements page rendering

### Verified on 2026-03-24 (pass 2)

- `go test ./... -count=1` — all packages pass including new smoke and git parsing tests
- `go build ./cmd/gitpulse`
- `go vet ./...`

New test coverage added in this pass:

- `internal/runtime/smoke_test.go` — end-to-end operator loop: seeds a temp git repo, exercises AddTarget → ImportRepoHistory → RescanAll → RebuildAnalytics → DashboardView → HTTP API endpoints
- `internal/runtime/smoke_test.go` — import idempotency: re-importing produces no duplicates
- `internal/runtime/smoke_test.go` — rebuild determinism: two consecutive rebuilds produce identical counts
- `internal/git/git_test.go` — table-driven tests for parseNumstat (8 cases), parseStatus (4 cases), parseGitLog (5 cases)
- `internal/git/git_test.go` — DiscoverRepositories against temp repos
- `internal/git/git_test.go` — ImportHistory with email filtering

### Previously verified on 2026-03-24

- `cd web && bun run build`
- `go mod tidy`
- `go test ./...`
- `go build ./cmd/gitpulse`
- `go run ./cmd/gitpulse --help`
- `go run ./cmd/gitpulse doctor`
- `go test ./internal/... ./cmd/gitpulse/...`

### Still not re-verified in this pass

- a full local operator loop against a _real_ production workspace (the smoke test covers a seeded temp workspace)
- the Python UI against a live long-running Go backend process outside test doubles
- `golangci-lint run` and `govulncheck ./...` (CI covers these)
- web build: `cd web && bun install && bun run build` (not re-run in this frontend rewrite pass)

---

## Active work board

These are ordered workstreams, not a fake finished roadmap.

### Workstream 1 — prove the daily operator loop

**Status:** active / highest priority

Why this matters:

The codebase already has the core runtime and UI. The next credibility jump is proving that a fresh local operator can build, start, add repositories, import history, rescan, rebuild analytics, and inspect results without undocumented handholding.

Checklist:

- [x] capture one reproducible smoke workflow that exercises `serve`, `add`, `import`, `rescan`, `rebuild-rollups`, and `doctor`
- [x] choose a fixture strategy: tiny seeded git repo, temp repo generator, or both
- [x] assert something durable at the end of the flow: DB rows, JSON API output, or both
- [x] document the expected operator-visible outcomes of that run
- [x] keep the smoke path cheap enough to run routinely in local development

Implementation:

- `internal/runtime/smoke_test.go` — `TestSmokeOperatorLoop` seeds a temp git repo with 4 commits across 4 days, then exercises the full operator pipeline: AddTarget (auto-imports), ImportRepoHistory (idempotent re-import), RescanAll, RebuildAnalytics, and all view generators (DashboardView, SessionsSummary, RepoDetail, AchievementsView). Stands up an httptest server and hits `/api/dashboard`, `/api/repositories`, `/api/sessions`, `/api/achievements`, and `/api/repositories/{id}`.
- `TestSmokeImportIdempotency` — verifies re-importing the same commits produces no duplicates.
- `TestSmokeRebuildDeterminism` — verifies two consecutive analytics rebuilds produce identical counts.
- Total smoke test runtime: ~1s. No external dependencies beyond git. Uses `t.TempDir()` for full isolation.

Expected operator-visible outcomes after a smoke run:

- 1 repository tracked (state=active)
- 4 commits imported (deduplicated on re-import)
- 1 snapshot per rescan
- Daily rollups for scope "all" and per-repo (4 days)
- Non-zero committed additions in rollups
- At least 2 achievements (first_repo, first_commit_tracked)
- 4 focus sessions (one per day)
- All API endpoints return HTTP 200 with populated JSON

Exit criteria: **met**

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

### Workstream 3 — replace the React operator surface with the Python UI in reversible slices

**Status:** active

Why this matters:

The frontend direction has changed. The Go backend still earns its keep, but the long-term browser surface should match the Python stack used elsewhere. The transition only works if each slice is verified, reversible, and honest about what has or has not reached parity.

Checkpoint completed in this pass:

- [x] create `python-ui/` as a standalone FastAPI + Jinja2 + htmx rewrite lane
- [x] keep the Go backend and JSON API unchanged as the source of truth
- [x] render dashboard, repositories, repository detail, sessions, achievements, and settings pages from Python
- [x] forward repository actions and settings writes through the Python UI to the Go API
- [x] add Python verification with Ruff, Pyright, and pytest
- [x] vendor local Alpine.js and htmx assets so the Python UI no longer depends on CDN script tags
- [x] improve backend-unavailable and unreadable-response handling with actionable recovery guidance
- [x] surface repository freshness signals from existing Go API fields, including snapshot timing, repo update timing, and recent push visibility

Next checklist:

- [x] compare Python UI behavior against the React pages and close the biggest parity gaps first
- [x] improve operator feedback for long-running import, rescan, and rebuild actions
- [x] expand fresh-database empty states and first-run guidance across every Python UI page
- [ ] decide when the Python UI is credible enough to become the default served surface

Current blocker to default-serving the Python UI:

- `gitpulse serve` still serves the built React SPA from `web/dist`
- the Python UI still requires its own FastAPI process on a second port
- this repo has not yet chosen the cutover mechanism: embed, proxy, co-serve, or explicitly keep the split-process model longer

Exit criteria:

- the Python UI covers the daily operator loop with enough confidence to replace the React SPA by default
- the project has a verified single-entrypoint story for serving that Python UI

### Workstream 4 — keep the runtime honest under load

**Status:** active

Why this matters:

The stack direction is now stable enough to spend effort on confidence-building tests instead of more stack migration churn.

Checklist:

- [x] CI runs Go test, vet, build, `golangci-lint`, and `govulncheck`
- [x] CI runs web check, test, and build
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
- the shipping browser UI is still React + Vite under `web/`
- a verified Python UI rewrite lane now exists under `python-ui/`
- the Python UI now covers the daily operator loop with explicit first-run guidance and manual runbook actions
- the Go server still serves the built SPA today because the Python UI still runs as a separate FastAPI process
- packaging is optional, not part of the current done definition

## Decisions that still need a call

These are the real judgment points still hanging over the repo:

- watcher vs poller vs manual-first ingestion for v1
- how much push verification or remote-state parity is actually worth carrying
- whether a schema/version story beyond bootstrap + migration file needs to move up in priority
- whether observability endpoints belong before a background service mode exists
- when the Python UI becomes the default served frontend and whether the project should embed, proxy, or otherwise co-serve the FastAPI surface from the Go entrypoint
- whether desktop packaging is a real product need or just tempting scope

---

## Risks and constraints

- The biggest product risk is not stack mismatch anymore; it is ambiguity in the operator workflow.
- A watcher/background loop can easily become complexity bait if it lands before the manual workflow is deeply verified.
- The React UI can create false confidence if it suggests freshness or automation the runtime does not yet guarantee.
- Carrying two frontend lanes for too long would create drift unless the Python rewrite keeps landing verified parity slices. The biggest remaining drift risk is not page parity now; it is keeping a separate Python process in sync with the Go-served default entrypoint.
- Packaging too early would multiply support burden while the core loop is still settling.
- Because analytics are rebuildable, the repo should prefer deterministic raw event capture and explicit rebuild flows over magical hidden state.

---

## Immediate next moves

~~1. create a cheap seeded local smoke path for `add` + `import` + `rescan` + `rebuild-rollups`~~ **Done.** `TestSmokeOperatorLoop` in `internal/runtime/smoke_test.go`.
~~2. verify the result through the SQLite database and one JSON endpoint~~ **Done.** Asserts DB rows (repos, commits, rollups, achievements, sessions, snapshots) and all JSON API endpoints.
~~3. document the expected output and failure modes in-repo~~ **Done.** Expected outcomes documented in Workstream 1 checklist above.

If only one substantial thing gets done next, make it this:

1. decide the Python cutover path: either teach `gitpulse serve` to launch/proxy/embed the Python UI or explicitly keep the separate-process model for another checkpoint (Workstream 3)
2. decide whether v1 ingestion is explicit-manual, periodic polling, or watcher-based (Workstream 2)
3. if watcher/poller is deferred, update both frontend lanes and docs to not imply automatic tracking
4. optionally add fuzz testing for git parsing (Workstream 4)

The smoke test plus the new Python UI tests now provide a fast feedback loop for any of these next moves.

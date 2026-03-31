# GitPulse BUILD

Purpose: current-truth execution manual for rewriting GitPulse from the current Go + SQLite application into Stephen's unified full-stack web stack.

Target stack:

- Bun
- TypeScript
- Astro
- Vue
- Elysia
- Zod
- PostgreSQL
- Docker Compose
- Caddy

This is a planning and execution document, not a claim that the rewrite already exists. The shipped product today is still the Go + SQLite implementation described in `README.md`, `docs/architecture.md`, and `docs/operator-workflow.md`.

## Rewrite decision

GitPulse is no longer on a "keep Go and just finish the frontend" path.

The approved destination is a full-stack TypeScript rewrite with Bun as the runtime, Elysia as the backend, Astro + Vue as the web frontend, Zod as the contract boundary, PostgreSQL as the primary data store, Docker Compose as the default local and deploy runtime, and Caddy as the public edge.

Primary architectural destination:

- one TypeScript runtime lane
- one web-first product surface
- one default containerized runtime path
- one database target
- one same-origin app boundary

Transitional and secondary surfaces:

- the current Go CLI stays alive only as a compatibility surface until cutover
- the current source-run terminal preview is not the destination architecture
- any future CLI or TUI work must be justified as an admin or compatibility lane after the web rewrite is stable

Do not spend rewrite effort preserving the current split-stack shape just because it already exists.

## Current state

### Runtime and stack today

GitPulse currently ships as:

- Go 1.26.1 backend and CLI
- SQLite via `database/sql` and `modernc.org/sqlite`
- plain SQL in `internal/db/`
- `net/http` JSON API and static frontend serving from Go
- Bun workspace under `frontend/`
- Astro + Vue web frontend under `frontend/web/`
- TypeScript terminal preview under `frontend/tui/`

### Current operator model

The supported operator loop is still manual-first:

1. add repositories or folders
2. import recent history
3. rescan working trees
4. rebuild analytics
5. inspect dashboard, repository detail, sessions, achievements, and settings

GitPulse does not currently ship background watchers, pollers, desktop packaging, or cloud services.

### Current persistence model

The active SQLite schema stores:

- tracked targets
- repositories
- repo status snapshots
- file activity events
- commit events
- push events
- focus sessions
- daily rollups
- achievements
- settings

That domain model is worth preserving. The storage engine and runtime are not.

### What the current implementation already proves

The existing app has already validated the core product shape:

- local-first git analytics is viable
- separate ledgers for working tree, commits, and pushes are the right product model
- explicit operator actions are clearer than hidden background automation
- a browser surface is the primary user-facing product surface
- the CLI remains useful as an escape hatch and diagnostics lane, not as the long-term main experience

### Why rewrite instead of extending the current stack

Reasons for the rewrite:

- Stephen now wants maximum stack unification around Bun + TypeScript + Astro + Vue
- the repo currently splits core ownership across Go, TypeScript, and a transitional TUI lane
- the present Go + SQLite implementation is a good prototype and product validator, but not the chosen long-term architecture
- Docker Compose + Caddy + PostgreSQL is the desired deploy and runtime contract going forward
- future feature work is easier to ship and maintain when backend contracts, validation, web UI, and shared types all live in one TypeScript lane

## Target state

GitPulse should converge on this shape:

```text
gitpulse/
  apps/
    api/                  # Elysia backend
    web/                  # Astro + Vue operator web app
  packages/
    contracts/            # Zod schemas and inferred shared types
    core/                 # Git ingestion, analytics, services, shared business logic
    ui/                   # shared Vue components, formatting helpers, composables
    config/               # env parsing, runtime config, path helpers
  db/
    migrations/           # PostgreSQL schema migrations
    seeds/                # optional fixture data for tests and smoke runs
  deploy/
    Caddyfile
  scripts/
    migrate-sqlite.ts     # legacy data import into PostgreSQL
    smoke.ts              # end-to-end local smoke checks
  docker-compose.yml
  Dockerfile
  README.md
  BUILD.md
```

### Runtime target

Shipped runtime shape:

- Caddy is the front door
- Caddy serves the built Astro app and proxies `/api/*` to Elysia
- Elysia owns all API routes and action execution
- PostgreSQL is the only primary application database
- Bun is the only application runtime
- Zod is the contract source of truth for requests, responses, settings payloads, and action payloads

### Product target

GitPulse vNext should ship as a local-first web product with these primary surfaces:

- dashboard
- repositories list
- repository detail
- sessions
- achievements
- settings
- explicit operator action center for add, import, rescan, rebuild, and settings updates

CLI and TUI lanes are not the destination. If they survive at all, they should sit behind the web and API architecture as thin compatibility surfaces.

## Rewrite principles

1. Preserve product truth, not implementation loyalty.
2. Keep local-first as a hard constraint.
3. Preserve the manual-first operator loop at first cutover.
4. Preserve separate ledgers for live work, commit history, and push history.
5. Rebuild analytics from stored events instead of hiding state in the UI.
6. Put validation at the Elysia boundary with Zod.
7. Keep same-origin behavior boring through Caddy.
8. Prefer explicit SQL and explicit services over ORM theater.
9. Treat the current Go app as the reference implementation during migration, not as architecture to keep forever.
10. Do not port the TUI as a first-class requirement.

## Data and runtime constraints

These constraints apply to every phase.

### Product constraints

- Local-first is non-negotiable.
- No source upload or cloud dependency for core use.
- Manual add, import, rescan, rebuild, and inspect remains the baseline interaction model until a later phase explicitly changes it.
- Separate ledgers for working tree, commit, and push activity must survive the rewrite intact.
- Repo-controlled strings and file paths remain untrusted input.

### Runtime constraints

- Docker Compose is the default local and deployment path for the rewritten app.
- Caddy is the only public HTTP edge in shipped mode.
- The browser talks to one origin in shipped mode.
- Bun is the only application runtime in the target architecture.
- PostgreSQL is the target system of record. SQLite becomes legacy import input only.

### Migration constraints

- The current Go + SQLite app remains the reference system until vNext reaches cutover quality.
- Do not run dual-write between Go/SQLite and Elysia/PostgreSQL in production-like flows.
- Migrate data by import from the legacy SQLite database into PostgreSQL, with documented and repeatable tooling.
- Keep current docs honest about what is shipped now versus what is planned next.

### Scope constraints

- No desktop packaging work inside the rewrite unless the web cutover is already complete.
- No TUI expansion as a primary phase target.
- No background watcher or poller work during the first cutover unless explicitly carved out, implemented, and verified as its own feature.

## Migration phases

### [ ] Phase 0 - Freeze the contract and define the boundary

Goal: make the rewrite concrete before code churn starts.

Deliverables:

- freeze the current product contract from the Go app and current docs
- inventory the current SQLite schema, current API routes, current config behavior, and current operator actions
- define the vNext repo layout, container topology, ports, and environment contract
- define the SQLite to PostgreSQL migration plan at the table and field level
- define parity fixtures using a small set of real git repositories and a deterministic test database

Required outputs:

- schema mapping document from current SQLite tables to PostgreSQL tables
- route map for vNext web pages and Elysia endpoints
- list of current config keys to keep, rename, or delete
- cutover checklist with explicit non-goals

Exit criteria:

- rewrite scope is bounded
- migration data path is specified
- no one has to guess which current behaviors are required for parity

### [ ] Phase 1 - Bootstrap the unified TypeScript monorepo

Goal: establish the permanent repo shape and runtime path.

Deliverables:

- create root Bun workspace for the whole app, not just the frontend
- add `apps/api` for Elysia and `apps/web` for Astro + Vue
- add `packages/contracts` for Zod schemas and inferred shared types
- add `packages/core` for shared domain services, analytics logic, and git integration helpers
- add `packages/config` for environment parsing and runtime config
- add `packages/ui` only if shared Vue components or composables actually earn it
- add Dockerfile and `docker-compose.yml` for PostgreSQL, API, and Caddy
- add `deploy/Caddyfile` and make same-origin routing the default
- define root verification scripts for lint, typecheck, test, build, and smoke

Exit criteria:

- the repo can boot an empty vNext stack through Docker Compose
- Astro and Elysia both run under Bun
- shared contracts compile from one source of truth
- Caddy can serve the web app and proxy the API locally

### [ ] Phase 2 - Rewrite the data layer onto PostgreSQL

Goal: replace the SQLite persistence model with a PostgreSQL schema that preserves product meaning.

Deliverables:

- create PostgreSQL migrations for repositories, snapshots, file activity, commits, pushes, sessions, rollups, achievements, and settings
- normalize timestamp handling, enum handling, and JSON payload handling for PostgreSQL
- implement explicit query modules and service-layer writes in TypeScript
- keep SQL explicit and reviewable
- write the legacy importer that reads the current SQLite database and inserts canonical PostgreSQL records
- create fixtures for fresh installs and migrated installs

Important rules:

- preserve separate ledgers instead of collapsing them into one activity table
- keep analytics rebuildable from stored events
- do not invent a more magical data model during the rewrite
- do not add an ORM unless plain SQL becomes an actual blocker and the trade is explicitly approved

Exit criteria:

- PostgreSQL schema can support the full current product domain
- a fresh install works on PostgreSQL only
- a legacy SQLite database can be imported with documented tooling
- data parity checks pass on a representative fixture set

### [ ] Phase 3 - Rewrite backend behavior in Elysia

Goal: move runtime orchestration, action handling, settings writes, and read models into the TypeScript backend.

Deliverables:

- implement Elysia route groups for dashboard, repositories, repository detail, sessions, achievements, settings, and health
- implement Elysia action endpoints for add, import, rescan, rebuild, refresh, toggle, remove, and settings save
- validate all request and response payloads with Zod
- move git subprocess integration into `packages/core`
- move analytics rebuild logic into `packages/core`
- keep action execution server-side only
- expose stable machine-readable action result payloads with user-facing summaries

Backend rewrite stages inside this phase:

1. repository registration and discovery
2. history import
3. working-tree rescan
4. analytics rebuild
5. settings load and save
6. dashboard and detail read-model assembly
7. health and diagnostics endpoints

Exit criteria:

- Elysia can run the full manual operator loop without the Go runtime
- the API contract is Zod-owned and shared with the web app
- the app can start, operate, and persist without any Go process present

### [ ] Phase 4 - Rewrite the browser product in Astro + Vue

Goal: make the web app the first-class product surface on top of the new Elysia backend.

Deliverables:

- build Astro route shells for all shipped operator pages
- implement Vue components and islands only where interactivity is earned
- consume shared Zod-derived contracts through typed client helpers
- preserve first-run guidance, empty states, loading states, and backend error handling
- keep operator actions explicit and visible
- make settings editable through the new API
- keep the browser surface same-origin through Caddy in shipped mode

Frontend rewrite stages inside this phase:

1. app shell, navigation, and layout system
2. dashboard and action center
3. repositories list with filtering and bulk actions
4. repository detail with commits, pushes, sessions, languages, and file activity
5. sessions and achievements pages
6. settings and diagnostics views
7. first-run, empty, error, and rebuild-needed states

Exit criteria:

- the web app covers the current browser product surface
- the web app feels native to the new stack instead of mimicking Go templates or the transitional TUI
- no shipped browser workflow depends on the Go runtime

### [ ] Phase 5 - Parallel verification, migration, and cutover

Goal: prove parity against the current app and switch the default product path.

Deliverables:

- run the Go app and the rewritten stack side by side against the same fixture repositories
- verify dashboard numbers, repository counts, session totals, achievement unlocks, and settings behavior
- verify manual add, import, rescan, and rebuild actions in both fresh-install and migrated-data flows
- validate the SQLite to PostgreSQL import path end to end
- make Docker Compose the default quick-start path in the docs
- make Caddy the default local and deploy edge
- decide whether a compatibility CLI is still required after the web cutover
- explicitly deprecate or remove the current source-run TUI unless it has already earned a post-cutover role

Cutover rules:

- default docs point to Docker Compose + Caddy + PostgreSQL
- the Go app moves into legacy mode and only stays around long enough to support migration confidence
- any remaining CLI surface must sit on top of the new TypeScript backend or be clearly labeled legacy

Exit criteria:

- vNext is the documented and verified default runtime
- data migration is repeatable and boring
- the old Go path is no longer the mainline product story

### [ ] Phase 6 - Remove legacy runtime and tighten the repo

Goal: finish the rewrite and delete the transitional architecture.

Deliverables:

- remove Go runtime, Go-only docs, and SQLite-first assumptions once cutover is complete
- remove or archive the old `frontend/tui` lane unless it earned an explicit support commitment
- remove stale migration-only notes from the README and architecture docs
- update CI to validate only the active Bun + TypeScript + Docker path
- publish release notes that explain migration, operator expectations, and any dropped lanes

Exit criteria:

- GitPulse is a Bun + TypeScript application end to end
- PostgreSQL is the only primary application database
- Caddy and Docker Compose are the standard runtime path
- the repo no longer reads like a Go app with a frontend attached

## Backend rewrite stages

Use these as the sequencing checklist inside Phases 2 and 3.

### Stage A - Database contract

- define PostgreSQL schema
- define indexes and uniqueness rules
- define how JSON payloads and enum-like fields are represented
- document field mapping from SQLite

### Stage B - Git ingestion runtime

- port repo discovery
- port status snapshot collection
- port commit import
- port push detection
- keep subprocess execution explicit and testable

### Stage C - Analytics and rebuild logic

- port sessionization
- port rollup generation
- port score and achievement logic
- verify deterministic results against fixture data

### Stage D - Settings and config model

- decide what stays in env, what stays in file bootstrap, and what belongs in the database
- keep config boring and inspectable
- do not force container-specific values into the UI if env config is the right source

### Stage E - API assembly

- build read models for dashboard, repositories, repository detail, sessions, achievements, and settings
- build action handlers with stable result payloads
- build health and diagnostics endpoints

### Stage F - Legacy import and cutover tooling

- implement SQLite import command or script
- implement parity comparison helpers
- implement migration smoke checks

## Frontend rewrite stages

Use these as the sequencing checklist inside Phase 4.

### Stage A - Shared contract consumption

- generated or inferred types from Zod
- one typed API client
- one shared error and action-result model

### Stage B - Application shell

- layout
- navigation
- route structure
- loading and error boundaries

### Stage C - Core operator pages

- dashboard
- repositories list
- repository detail
- sessions
- achievements
- settings

### Stage D - Action UX

- add target
- import
- rescan
- rebuild
- toggle and remove repository
- save patterns and settings

### Stage E - Fit and finish

- first-run states
- empty states
- degraded backend states
- diagnostics visibility
- mobile and narrow-window behavior

### Stage F - Post-cutover cleanup

- remove UI assumptions carried over from the Go-served frontend
- remove temporary parity shims
- remove legacy wording from operator docs

## Acceptance criteria

The rewrite is done only when all of the following are true:

- Bun and TypeScript own the app end to end
- Elysia owns the backend runtime and action execution
- Astro + Vue own the primary user-facing product surface
- Zod owns shared API contracts and validation boundaries
- PostgreSQL is the primary database and SQLite is only a migration source
- Docker Compose starts the full app locally with PostgreSQL, API, web build artifact, and Caddy
- Caddy serves one same-origin app boundary in shipped mode
- the web app supports add, import, rescan, rebuild, and inspect without the Go runtime
- dashboard, repositories, repository detail, sessions, achievements, and settings all exist in the new web app
- current SQLite users can migrate their data into PostgreSQL with a documented tool and a documented verification step
- the old Go path is either removed or clearly archived as legacy
- docs describe the new reality without hedging or split-stack confusion

## Verification expectations

This repo is docs-only in this pass, but the implementation phases should not close without explicit verification.

### While the Go app is still the shipped app

Keep the current checks passing until cutover:

```bash
go test ./...
go build ./...
go vet ./...
cd frontend && bun run check && bun run --filter @gitpulse/web build
```

### Required checks before Phase 1 exit

These scripts should exist and pass:

```bash
bun install
bun run lint
bun run typecheck
bun run test
bun run build
docker compose up -d --build
```

### Required checks before Phase 3 exit

These checks should exist and pass:

```bash
bun run test:api
bun run test:contracts
bun run test:core
bun run smoke:api
```

### Required checks before Phase 4 exit

These checks should exist and pass:

```bash
bun run test:web
bun run check:web
bun run build:web
bun run smoke:web
```

### Required checks before cutover

These checks should exist and pass:

```bash
bun run smoke:migration
docker compose up -d --build
bun run smoke:e2e
bun run verify:parity
```

The exact script names can change, but the verification responsibilities cannot disappear.

## Explicit risks

### 1. Product drift during rewrite

A full rewrite makes it easy to accidentally rebuild a different product. The fix is to anchor every phase to the current operator loop and the current ledger model.

### 2. Data migration complexity

SQLite to PostgreSQL migration can silently corrupt timestamps, uniqueness rules, enum-like values, or JSON payload shape if handled casually. The fix is explicit mapping, fixture databases, and repeatable smoke checks.

### 3. Split-brain transition risk

Running the legacy app and the rewritten app in parallel can create confusion about which system is authoritative. The fix is one-way migration and no dual-write.

### 4. Overbuilding the stack

A Bun + Astro + Vue + Elysia rewrite can still become framework theater if too many abstractions pile up. The fix is explicit contracts, explicit SQL, and ruthless scope control.

### 5. TUI distraction

The existing terminal preview can drain time without moving the rewrite forward. The fix is to treat it as a compatibility lane only and drop it if it does not earn maintenance after web cutover.

### 6. Container-first friction for local-first users

Docker Compose is the approved runtime path, but it adds local complexity. The fix is a boring one-command quick start, predictable volumes, and simple data export and backup guidance.

### 7. Postgres overreach

PostgreSQL is the chosen target because the stack is being unified, not because GitPulse suddenly needs distributed scale. The schema and service layer still need to stay small, inspectable, and local-first.

## What not to do

- Do not keep adding real feature work to the Go runtime unless it is required for current-user stability or to unblock migration.
- Do not treat the current TUI as a required parity target.
- Do not move core analytics logic into Vue components.
- Do not make Astro SSR a default requirement unless the product proves it needs it.
- Do not introduce extra databases, queues, or cloud services.
- Do not hand-wave the SQLite to PostgreSQL migration.
- Do not let docs claim the rewrite landed before it actually did.

## Immediate next step

Phase 0 is the active phase for the rewrite plan itself.

That means the next implementation work should start by freezing the current contract, defining the PostgreSQL mapping, defining the Elysia route map, and scaffolding the unified Bun workspace at the repo root. Only after that should the actual backend and frontend rewrite begin.

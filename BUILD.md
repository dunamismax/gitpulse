# BUILD.md

## Agent operating rules

Future agents working in `gitpulse` must follow these rules before touching code or docs:

- Read this file first.
- Treat this file as the active rewrite execution manual while the rewrite is in flight.
- Keep this file current whenever scope, sequencing, or repo truth changes.
- Only check a box after the work is actually completed and verified in the repo.
- Do not mark a box done for partial progress, intent, or unverified claims.
- Keep stable docs focused on current shipped truth. Keep forward-looking execution detail here while the rewrite is active.
- Treat `README.md`, `docs/architecture.md`, and `docs/operator-workflow.md` as current shipped-state docs until cutover is done.
- If code and docs disagree about shipped behavior, code wins.
- If this file and older planning language disagree about the rewrite target, this file wins.

## Rewrite decision

`GitPulse` is now on a full-stack TypeScript end-to-end rewrite path.

The approved destination is Stephen's web full-stack lane:

- TypeScript
- Bun
- Astro
- Vue when the interaction level earns it
- Elysia
- Zod
- PostgreSQL
- Docker Compose
- Caddy

This repo is no longer on a hybrid plan where Go stays the backend and the browser just keeps growing around it.
The shipped Go plus SQLite implementation remains the current product until the rewrite reaches parity and cutover quality, but it is not the long-term architecture.

## Current repo truth

GitPulse ships today as a Go application with a real browser frontend already in place:

- Go backend and Cobra CLI under `cmd/` and `internal/`
- SQLite via `database/sql` and `modernc.org/sqlite`
- plain SQL persistence and migration files under `internal/db/` and `migrations/`
- `net/http` JSON API plus static serving of the built Astro app from Go
- Bun workspace under `frontend/`
- Astro plus Vue operator web UI under `frontend/web/`
- TypeScript terminal preview under `frontend/tui/`
- manual-first operator loop: add, import, rescan, rebuild, inspect
- unshipped vNext bootstrap under `apps/`, `packages/`, `db/migrations/`, `deploy/`, and `docker-compose.yml`

What the current implementation has already proven:

- local-first git analytics is a valid product shape
- separate ledgers for working tree activity, commit history, and push history are the right domain model
- explicit operator actions are better than hidden automation for the current product
- the browser surface is the primary user-facing product, even though Go still serves it today
- the TUI is useful as a secondary source-run surface, not as the future architectural center

What must stay honest during the rewrite:

- the shipped app today is still Go plus SQLite
- no shipped PostgreSQL runtime exists here yet
- the new root Bun workspace is only a bootstrap lane today, not the default product runtime
- host-side vNext verification is green and the unshipped vNext stack now passes a local Docker Compose smoke through Caddy for web root, API health, dashboard, and repositories
- the TUI exists, but it is not a required parity target for the rewrite

## Phase status board

- [x] Phase 0 - rewrite boundary frozen and migration plan documented
- [x] Phase 1 - Bun, PostgreSQL, Docker Compose, and Caddy bootstrap verified locally
- [ ] Phase 2 - PostgreSQL data layer rewrite in TypeScript
- [ ] Phase 3 - Elysia backend parity
- [ ] Phase 4 - Astro and Vue browser parity
- [ ] Phase 5 - parity verification, data migration, and cutover
- [ ] Phase 6 - legacy runtime removal

## Target state

`GitPulse` should converge on one Bun-first TypeScript runtime with a web-first product surface.

### Target repo shape

```text
gitpulse/
  apps/
    api/                  # Elysia backend
    web/                  # Astro + Vue operator app
  packages/
    contracts/            # Zod schemas and inferred shared types
    core/                 # git ingestion, analytics, services, shared logic
    config/               # env parsing, runtime config, path helpers
    ui/                   # shared UI bits only if they actually earn it
  db/
    migrations/           # PostgreSQL schema migrations
    seeds/                # fixture or smoke data when needed
  deploy/
    Caddyfile
  scripts/
    migrate.ts            # apply PostgreSQL schema migrations during bootstrap
    migrate-sqlite.ts     # legacy SQLite to PostgreSQL importer
    smoke.ts              # end-to-end local smoke checks
  docker-compose.yml
  README.md
  BUILD.md
```

### Runtime target

- Bun is the only application runtime in the final architecture.
- Elysia owns all API routes and operator action execution.
- Astro owns page delivery and app shell routing.
- Vue is used for interaction-heavy operator views where it clearly helps.
- Zod owns request, response, and settings payload validation.
- PostgreSQL is the only primary application database.
- Docker Compose is the default local and self-hosted runtime path.
- Caddy is the front door and same-origin HTTP edge.

### Product target

GitPulse vNext should ship as a local-first web product with these primary surfaces:

- dashboard
- repositories list
- repository detail
- sessions
- achievements
- settings
- explicit operator action center for add, import, rescan, rebuild, refresh, toggle, remove, and diagnostics

CLI and TUI lanes are compatibility surfaces only if they still earn maintenance after the web and API cutover.

## Boundaries and non-goals

These are not rewrite goals unless Stephen changes direction:

- keeping Go as the permanent backend while only replacing pieces around it
- treating the current TUI as a required parity target
- adding background watchers, pollers, or cloud services during first cutover unless explicitly carved out and verified
- adding desktop packaging work before the web and API rewrite is complete
- replacing explicit SQL with an ORM just because the language changed
- changing the product into a source-upload or cloud-first analytics service

## Hard constraints

- Local-first behavior is non-negotiable.
- No source upload or cloud dependency for core use.
- The manual-first operator loop remains the baseline interaction model until a later phase explicitly changes it.
- Separate ledgers for working tree, commit, and push activity must survive the rewrite intact.
- Repo-controlled strings, subprocess output, and filesystem paths remain untrusted input.
- Docker Compose must become the boring default runtime path.
- Caddy is the only public HTTP edge in the shipped path.
- The browser should talk to one origin in shipped mode.
- SQLite becomes legacy import input only once the rewrite lands. It is not the end-state application store.
- There is no dual-write phase between the Go app and the rewritten stack.

## Phase plan

## Phase 0 - Freeze the current contract and define the migration boundary

### Work checklist

- [x] Freeze the current product contract from the Go app and current docs.
- [x] Inventory the current SQLite schema, API routes, config behavior, CLI actions, and operator workflow.
- [x] Define the vNext repo layout, container topology, ports, and environment contract.
- [x] Define the SQLite to PostgreSQL migration plan at the table and field level.
- [x] Define parity fixtures using a small set of deterministic git repositories and test databases.
- [x] Define a cutover checklist with explicit non-goals.

### Exit criteria

- [x] Rewrite scope is bounded.
- [x] The data migration path is specific instead of hand-waved.
- [x] No one has to guess which current behaviors are required for parity.

## Phase 1 - Bootstrap the unified TypeScript monorepo

### Work checklist

- [x] Create a root Bun workspace for the whole app, not just the frontend.
- [x] Add `apps/api` for Elysia and `apps/web` for Astro and Vue.
- [x] Add `packages/contracts` for Zod schemas and inferred shared types.
- [x] Add `packages/core` for shared domain services, analytics rebuild logic, and PostgreSQL data-layer helpers.
- [x] Add `packages/config` for environment parsing and runtime config.
- [x] Leave `packages/ui` out for now because shared UI is not earned yet.
- [x] Add PostgreSQL migrations under `db/migrations/`.
- [x] Add `docker-compose.yml` for PostgreSQL, API, web, and Caddy.
- [x] Add `deploy/Caddyfile` and make same-origin routing the default.
- [x] Define root verification scripts for lint, typecheck, test, build, and smoke.

Verified state:

- `docker compose up -d` now reaches a healthy local bootstrap with PostgreSQL, API, web, and Caddy.
- The stale `ESBUILD_BINARY_PATH` override was removed from the `web` service, and Astro is pinned to `5.13.6` so Astro and Vite stay on the same `esbuild` major path under Bun in containers.
- `scripts/migrate.ts` now applies every `db/migrations/*.sql` file against PostgreSQL during API startup, so the bootstrap stack comes up against an initialized schema.
- This is still only bootstrap verification, not backend or UI parity with the shipped Go runtime.

### Exit criteria

- [x] The repo can boot an empty vNext stack through Docker Compose.
- [x] Astro and Elysia both run under Bun.
- [x] Shared contracts compile from one source of truth.
- [x] Caddy can serve the web app and proxy the API locally.

## Phase 2 - Rewrite the data layer onto PostgreSQL

### Work checklist

- [x] Create PostgreSQL migrations for repositories, snapshots, file activity, commits, pushes, sessions, rollups, achievements, and settings.
- [x] Normalize timestamp, enum-like, and JSON payload handling for PostgreSQL.
- [x] Implement explicit query modules and service-layer writes in TypeScript.
- [x] Keep SQL explicit and reviewable.
- [ ] Write the legacy importer that reads the current SQLite database and inserts canonical PostgreSQL records.
- [ ] Create fixtures for fresh installs and migrated installs.
- [x] Preserve separate ledgers instead of collapsing them into one activity table.
- [x] Keep analytics rebuildable from stored events.

Verified this pass:

- `packages/core` now owns explicit PostgreSQL migration helpers, normalization helpers, query modules, service-layer writes, and rebuild orchestration with readable SQL plus TypeScript analytics logic.
- Real round-trip coverage now exists against PostgreSQL through `packages/core/test/store.integration.test.ts`.
- `packages/core/src/analytics.ts` now rebuilds focus sessions, daily rollups, streak inputs, score inputs, and achievements directly from persisted snapshots, commits, push events, and file activity ledgers.
- Separate ledgers are preserved in the rebuild path instead of being collapsed into a synthetic activity table, with regression coverage in `packages/core/test/rebuild.test.ts` and real PostgreSQL persistence coverage in `packages/core/test/rebuild.integration.test.ts`.
- `scripts/migrate.ts` is shared with that Phase 2 store layer and still works in both host and Compose verification paths.

### Exit criteria

- [ ] PostgreSQL can support the full current product domain.
- [ ] A fresh install works on PostgreSQL only.
- [ ] A legacy SQLite database can be imported with documented tooling.
- [ ] Data parity checks pass on a representative fixture set.

## Phase 3 - Rewrite backend behavior in Elysia

### Work checklist

- [ ] Implement Elysia route groups for dashboard, repositories, repository detail, sessions, achievements, settings, and health.
- [ ] Implement Elysia action endpoints for add, import, rescan, rebuild, refresh, toggle, remove, and settings save.
- [ ] Validate all request and response payloads with Zod.
- [ ] Move git subprocess integration into `packages/core`.
- [x] Move analytics rebuild logic into `packages/core`.
- [ ] Keep action execution server-side only.
- [ ] Expose stable machine-readable action result payloads with user-facing summaries.

Verified this pass:

- `apps/api/src/read-models.ts` now threads the verified PostgreSQL store from `packages/core` into Elysia read-model services instead of only serving a health stub.
- `GET /api/dashboard` and `GET /api/repositories` now return Zod-validated PostgreSQL-backed payloads from `packages/contracts`.
- Real PostgreSQL-backed API coverage now exists in `apps/api/test/app.integration.test.ts`, and Compose smoke now verifies empty fresh-install responses for dashboard and repositories through Caddy.

### Exit criteria

- [ ] Elysia can run the full manual operator loop without the Go runtime.
- [ ] The API contract is Zod-owned and shared with the web app.
- [ ] The app can start, operate, and persist without any Go process present.

## Phase 4 - Rewrite the browser product in Astro and Vue

### Work checklist

- [ ] Build Astro route shells for all shipped operator pages.
- [ ] Implement Vue components and islands only where interactivity is clearly earned.
- [ ] Consume shared Zod-derived contracts through typed client helpers.
- [ ] Preserve first-run guidance, empty states, loading states, and backend error handling.
- [ ] Keep operator actions explicit and visible.
- [ ] Make settings editable through the new API.
- [ ] Keep the browser surface same-origin through Caddy in shipped mode.

### Exit criteria

- [ ] The web app covers the current browser product surface.
- [ ] The web app feels native to the new stack instead of mimicking Go templates or the transitional TUI.
- [ ] No shipped browser workflow depends on the Go runtime.

## Phase 5 - Verify parity, migrate data, and cut over the default runtime

### Work checklist

- [ ] Run the Go app and the rewritten stack side by side against the same fixture repositories.
- [ ] Verify dashboard numbers, repository counts, session totals, achievement unlocks, and settings behavior.
- [ ] Verify manual add, import, rescan, and rebuild actions in both fresh-install and migrated-data flows.
- [ ] Validate the SQLite to PostgreSQL import path end to end.
- [ ] Make Docker Compose the default quick-start path in the docs.
- [ ] Make Caddy the default local and deploy edge.
- [ ] Decide whether a compatibility CLI is still required after the web cutover.
- [ ] Explicitly deprecate or remove the current source-run TUI unless it earns a post-cutover role.

### Exit criteria

- [ ] vNext is the documented and verified default runtime.
- [ ] Data migration is repeatable and boring.
- [ ] The old Go path is no longer the mainline product story.

## Phase 6 - Remove legacy runtime and tighten the repo

### Work checklist

- [ ] Remove the Go runtime, Go-only docs, and SQLite-first assumptions once cutover is complete.
- [ ] Remove or archive the old `frontend/tui` lane unless it has earned an explicit support commitment.
- [ ] Remove stale migration-only notes from `README.md` and architecture docs.
- [ ] Update CI to validate only the active Bun and TypeScript plus Docker path.
- [ ] Publish release notes that explain migration, operator expectations, and any intentionally dropped lanes.
- [ ] Delete this file once the rewrite is complete and stable docs fully describe current truth.

### Exit criteria

- [ ] GitPulse is a Bun and TypeScript application end to end.
- [ ] PostgreSQL is the only primary application database.
- [ ] Caddy and Docker Compose are the standard runtime path.
- [ ] The repo no longer reads like a Go app with a frontend attached.

## Verification expectations

### Docs and planning changes

- [x] Search active docs for stale hybrid-backend future framing and remove or qualify it.
- [x] Run `git diff --check`.
- [x] Run targeted `rg` searches that confirm active docs describe the Go runtime as current truth, not future destination.

### Implementation phases

- [x] Keep the current Go and frontend verification lanes green while Go is still the shipped app.
- [x] Add root Bun verification scripts before Phase 1 is considered done.
- [ ] Add API, contract, and core smoke coverage before claiming backend cutover.
- [ ] Add migration smoke coverage before calling PostgreSQL cutover complete.
- [ ] Add end-to-end smoke coverage through Docker Compose and Caddy before calling the rewrite done.

## Definition of done

The rewrite is done only when all of these are true:

- [ ] Bun and TypeScript own the app end to end.
- [ ] Elysia owns backend runtime and action execution.
- [ ] Astro and Vue own the primary user-facing product surface.
- [ ] Zod owns shared API contracts and validation boundaries.
- [ ] PostgreSQL is the primary database and SQLite is only a migration source.
- [ ] Docker Compose starts the full app locally with PostgreSQL, API, web, and Caddy.
- [ ] Caddy serves one same-origin app boundary in shipped mode.
- [ ] The web app supports add, import, rescan, rebuild, and inspect without the Go runtime.
- [ ] Dashboard, repositories, repository detail, sessions, achievements, and settings all exist in the new web app.
- [ ] Current SQLite users can migrate their data into PostgreSQL with a documented tool and verification step.
- [ ] The old Go path is removed or clearly archived.
- [ ] Stable docs describe the new reality without split-stack confusion.

## Immediate next recommended work

- [x] Thread the verified PostgreSQL store from `packages/core` into `apps/api` services and route wiring.
- [ ] Implement the SQLite importer using the table rules in `docs/rewrite/sqlite-to-postgres.md`.
- [x] Start replacing the Go read routes with Elysia route groups beginning with `GET /api/dashboard` and `GET /api/repositories`.
- [ ] Extend the read-route replacement to `GET /api/repositories/{id}`, `GET /api/sessions`, `GET /api/achievements`, and `GET /api/settings` with the same PostgreSQL-backed and Zod-validated path.
- [ ] Start replacing the Go action routes with Elysia endpoints for add, import, rescan, rebuild, toggle, remove, and settings save.

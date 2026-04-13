# BUILD.md

## Agent operating rules

Future agents working in `gitpulse` must follow these rules before touching code or docs:

- Read this file first.
- Treat this file as the active rewrite execution manual while the Bun and TypeScript rewrite is in flight.
- Keep this file current whenever repo truth changes.
- Only check a box after the work is actually completed and verified in the repo.
- Do not mark a box done for partial progress, intent, or unverified claims.
- Keep stable docs focused on current shipped truth. Keep forward-looking execution detail here while the rewrite is active.
- Treat `README.md`, `docs/architecture.md`, and `docs/operator-workflow.md` as current shipped-state docs until cutover is done.
- If code and docs disagree about shipped behavior, code wins.
- If this file and older planning language disagree about the rewrite target, this file wins.

## Rewrite decision

`GitPulse` is on a full-stack TypeScript rewrite path.

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

This repo is not on a Swift or macOS-native product path. The shipped application today remains the Go plus SQLite implementation until parity and cutover are complete.

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

The repo also now contains a verified but unshipped vNext lane under `apps/`, `packages/`, `db/migrations/`, `deploy/`, `scripts/`, and `docker-compose.yml`:

- PostgreSQL migrations plus a Bun migration runner in `scripts/migrate.ts`
- PostgreSQL query modules, analytics rebuild logic, git integration, and SQLite importer groundwork in `packages/core/`
- shared Zod contracts in `packages/contracts/`
- config and path handling in `packages/config/`
- Elysia API read models and manual action routes in `apps/api/`
- Astro + Vue operator web app in `apps/web/` with all six primary surfaces and all ten manual actions wired to the vNext API
- same-origin local Compose stack through Caddy

What is verified right now:

- `bun run verify:vnext` is green
- PostgreSQL-backed API integration tests are present and passing in the vNext lane
- `docker compose up -d` plus `bun run smoke:vnext` now passes through Caddy on `http://127.0.0.1:7467`
- the vNext API can serve dashboard, repositories, repository detail, sessions, achievements, settings, and the current manual action surface without any Go process present

What must stay honest during the rewrite:

- the shipped app today is still Go plus SQLite
- the vNext web surface now covers all six primary operator pages and all ten manual actions, but end-to-end browser parity has not been verified against the shipped Go product yet
- vNext is not the default runtime yet
- the TUI exists, but it is not a required parity target for the rewrite
- SQLite migration and side-by-side parity are not done yet

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
- [x] Add `packages/core` for shared domain services, analytics logic, and git integration helpers.
- [x] Add `packages/config` for environment parsing and runtime config.
- [x] Leave `packages/ui` out for now because shared UI is not earned yet.
- [x] Add PostgreSQL migrations under `db/migrations/`.
- [x] Add `docker-compose.yml` for PostgreSQL, API, web, and Caddy.
- [x] Add `deploy/Caddyfile` and make same-origin routing the default.
- [x] Define root verification scripts for lint, typecheck, test, build, and smoke.
- [x] Add `scripts/migrate.ts` and apply schema migrations during vNext bootstrap.
- [x] Make the containerized Astro build pass under Bun by pinning `apps/web` to `astro@5.13.6`, which keeps Astro and Vite on the same `esbuild` line in Compose.

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
- [ ] Write the legacy importer that reads the current SQLite database and inserts canonical PostgreSQL records end to end.
- [ ] Create fixtures for fresh installs and migrated installs.
- [x] Preserve separate ledgers instead of collapsing them into one activity table.
- [x] Keep analytics rebuildable from stored events.

### Exit criteria

- [ ] PostgreSQL can support the full current product domain.
- [ ] A fresh install works on PostgreSQL only as the complete product runtime.
- [ ] A legacy SQLite database can be imported with documented tooling.
- [ ] Data parity checks pass on a representative fixture set.

## Phase 3 - Rewrite backend behavior in Elysia

### Work checklist

- [x] Implement Elysia route groups for dashboard, repositories, repository detail, sessions, achievements, settings, and health.
- [x] Implement Elysia action endpoints for add, import, rescan, rebuild, refresh, toggle, remove, and settings save.
- [x] Validate all request and response payloads with Zod.
- [x] Move git subprocess integration into `packages/core`.
- [x] Move analytics rebuild logic into `packages/core`.
- [x] Keep action execution server-side only.
- [x] Expose stable machine-readable action result payloads with user-facing summaries.
- [x] Add real PostgreSQL-backed API integration coverage for the current read and action slice.

### Exit criteria

- [ ] Elysia can run the full manual operator loop with parity against the shipped Go behavior.
- [x] The API contract is Zod-owned and shared with the web app.
- [x] The vNext API can start, operate, and persist without any Go process present.

## Phase 4 - Rewrite the browser product in Astro and Vue

### Work checklist

- [x] Build Astro route shells for all shipped operator pages.
- [x] Implement Vue components and islands only where interactivity is clearly earned.
- [x] Consume shared Zod-derived contracts through typed client helpers.
- [x] Preserve first-run guidance, empty states, loading states, and backend error handling.
- [x] Keep operator actions explicit and visible.
- [x] Make settings editable through the new API.
- [x] Keep the browser surface same-origin through Caddy in shipped mode.

### Exit criteria

- [ ] The web app covers the current browser product surface.
- [ ] The web app feels native to the new stack instead of mimicking Go templates or the transitional TUI.
- [ ] No shipped browser workflow depends on the Go runtime.

### Implementation notes

The vNext web surface lives in `apps/web/` as an Astro + Vue application using the `@astrojs/node` adapter in server output mode. All six primary operator pages (dashboard, repositories, repository detail, sessions, achievements, settings) and all ten manual actions are wired to the PostgreSQL-backed Elysia API through a typed client at `apps/web/src/lib/client.ts`. Vue islands handle interactive surfaces: ActionCenter, RepositoryListManager, RepoDetailActions, and SettingsForm. The design system CSS matches the shipped frontend. `bun run verify:vnext` is green.

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
- [x] Add API, contract, and core coverage for the current PostgreSQL-backed slice.
- [x] Add end-to-end smoke coverage through Docker Compose and Caddy for the current vNext bootstrap.
- [ ] Add migration parity coverage before calling PostgreSQL cutover complete.
- [ ] Add end-to-end browser parity coverage before calling the rewrite done.

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

- [x] Connect the Astro web surface to the verified vNext read and action routes, starting with dashboard and repositories.
- [ ] Expand the SQLite importer into a documented, end-to-end verified migration path with parity fixtures.
- [ ] Add side-by-side parity assertions between the Go runtime and the PostgreSQL-backed Elysia runtime for dashboard, repositories, sessions, achievements, and settings.
- [ ] Add browser-level tests for the operator loop now that the new web pages exist.
- [ ] Verify the full Compose stack (docker compose up plus smoke tests) with the new SSR web surface.
- [ ] Decide when the current TUI stops earning maintenance after web parity lands.

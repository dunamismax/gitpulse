# GitPulse BUILD

Purpose: status-tracked frontend migration plan from the legacy Python browser UI to GitPulse's Go + Bun frontend shape.

## Frontend decision

**Target shape: dual frontend**

- **Backend:** keep **Go** as the only backend and system of record
- **Web frontend:** **TypeScript + Bun + Astro + Vue**
- **Terminal frontend:** **TypeScript + Bun + OpenTUI**

### Why this is the right target

GitPulse already has two real operator surfaces today:

- a CLI for explicit control
- a local browser dashboard for inspection, settings, and runbook actions

A terminal-first operator console is still justified because the product is local-first, manual-first, and aimed at developers who already live in the terminal. A browser surface still matters for dashboards, detail pages, and settings. That keeps **dual frontend** as the right target.

This repo should **not** go web-only unless the TUI later proves redundant, and it should **not** go TUI-primary before the browser cutover and cleanup are clearly done.

## Current state

- Go owns runtime orchestration, CLI commands, JSON API, analytics, and SQLite access.
- SQLite with plain SQL is the active storage model.
- `gitpulse serve` now serves the built Astro frontend directly from `frontend/web/dist`.
- The shipped browser surface is Astro + Vue under `frontend/web/`.
- The legacy Python browser lane has been removed from the repo.
- The supported operator loop is still manual-first: **add -> import -> rescan -> rebuild -> inspect**.
- Background watchers, pollers, desktop packaging, and plugin runtime work are not current product truth.

## Status snapshot

- [x] Phase 0 is complete. `docs/frontend-parity-matrix.md` inventories the legacy browser surface and the migration boundary.
- [x] Phase 1 is complete. The Go API now exposes explicit frontend-facing contracts with focused contract tests.
- [x] Phase 2 is complete. `frontend/` now contains the Bun workspace, shared TypeScript contract layer, shared route and screen maps, and the lane structure for both the web and terminal frontends.
- [x] Phase 3 is complete. `frontend/web/` now owns the shipped browser surface and `gitpulse serve` serves the built web frontend directly from Go.
- [ ] Phase 4 is in progress. `gitpulse tui` now launches a keyboard-driven terminal preview backed by the live Go API, but the terminal lane still needs deeper keyboard polish and real-workspace validation before it is done.
- [x] Phase 5 is complete. The managed Python runtime path, docs, CI lane, and legacy `python-ui/` reference directory are gone.

## Target state

GitPulse should converge on this shape:

```text
cmd/gitpulse/               # Go CLI, serve command, tui launcher
internal/...                # Go runtime, DB, API, analytics, orchestration
frontend/
  shared/                   # shared TS API client, types, formatters, state helpers
  web/                      # Astro + Vue app
  tui/                      # OpenTUI app
```

Target behavior:

- Go remains the only backend and owns persistence, analytics, config, and API contracts.
- `gitpulse serve` serves the Astro build directly from Go in non-dev paths.
- The terminal entrypoint `gitpulse tui` keeps growing into the terminal operator console.
- Both frontends consume the same Go-owned API and shared TypeScript client and types.
- Python is no longer a runtime or shipped frontend dependency.

## Backend notes

- **Do not rewrite the backend in Python.** Go is the correct backend lane for this repo.
- Keep SQLite. GitPulse is deliberately local-first and single-operator today.
- Keep plain SQL unless backend query complexity clearly earns `sqlc` later.
- Keep the CLI as a first-class control surface even after the TUI exists.
- Promote the Go API from "good enough for one UI" to "stable enough for two first-class frontends."
- Frontends may shape presentation, but they must not own analytics, config truth, or persistence rules.

## Data and runtime constraints

- Local-first is non-negotiable. No source upload. No cloud dependency for core use.
- Manual-first is still current product truth. Do not smuggle in watchers or pollers as part of the frontend migration.
- Browser and terminal flows must preserve the explicit runbook actions: add, import, rescan, rebuild, inspect.
- Repo-controlled strings remain untrusted input in both frontends.
- `gitpulse serve` must not depend on a managed Python subprocess anymore.
- Desktop packaging stays out of scope for this migration.
- Keep same-origin behavior boring. The Go runtime remains the single local app boundary.

## Phase plan and status

### [x] Phase 0 - Lock the contract before replacing UI

Status notes:

- `docs/frontend-parity-matrix.md` inventories legacy routes, templates, read endpoints, action endpoints, and contract notes.
- The parity inventory named the migration-critical browser surfaces: dashboard, repositories, repo detail, sessions, achievements, settings, and operator actions.

Deliverables:

- [x] inventory current Python UI routes, pages, actions, and API dependencies
- [x] write a page and workflow parity matrix for: dashboard, repositories, repo detail, sessions, achievements, settings, and operator actions
- [x] define the target `frontend/` workspace layout and ownership boundaries
- [x] identify API and view-model gaps that were still Python-UI-shaped before contract hardening

Exit criteria:

- [x] parity scope is explicit before new UI work starts
- [x] Go API gaps are listed as backend tasks instead of hidden frontend surprises
- [x] future subagents can work from a bounded checklist

### [x] Phase 1 - Harden the Go frontend contract

Status notes:

- `internal/models/contracts.go` defines explicit response types for dashboard, repositories, repo detail, sessions, achievements, settings, and shared operator action payloads.
- `internal/web/server.go` exposes the full migration-critical read and action route set.
- Backend tests cover the migration-critical API surfaces.

Deliverables:

- [x] make the Go API and action endpoints explicit enough for both frontends
- [x] normalize response shapes so they are frontend-facing rather than template-shaped
- [x] add focused tests for dashboard, repositories, actions, sessions, achievements, and settings endpoints
- [x] keep all orchestration, validation, and persistence in Go

Exit criteria:

- [x] new frontends can consume a stable contract without Python-specific glue
- [x] manual operator actions are represented cleanly in the API
- [x] backend tests cover the migration-critical surfaces

### [x] Phase 2 - Create the shared TypeScript foundation

Status notes:

- `frontend/` is now a Bun workspace with shared tooling and verification scripts.
- `frontend/shared` owns the shared TypeScript API client, contract types, formatting helpers, operator action metadata, and shared route and screen maps.
- `frontend/web` and `frontend/tui` both boot against the live Go backend.

Deliverables:

- [x] create a Bun workspace under `frontend/`
- [x] add `frontend/shared` for API client code, shared types, formatting helpers, and common domain utilities
- [x] define route and screen maps for web and TUI against the same domain model
- [x] wire local dev against the live Go backend

Exit criteria:

- [x] one shared TypeScript contract exists for both frontends
- [x] both frontend lanes can boot against the current Go runtime
- [x] no frontend-specific type drift is required to talk to Go

### [x] Phase 3 - Replace the browser UI with Astro + Vue

Status notes:

- `frontend/web/` now ships the browser surface for dashboard, repositories, repo detail, sessions, achievements, settings, and explicit operator actions against the live Go API.
- First-run guidance, backend error handling, and manual action feedback exist in the Astro web app as part of the migration-critical browser flow.
- `gitpulse serve` now serves the built Astro frontend directly from `frontend/web/dist`, with route-aware page shell serving from Go.
- The shipped browser surface no longer depends on FastAPI, Jinja2, htmx, or Alpine.js.

Deliverables:

- [x] build the web app in `frontend/web`
- [x] reach feature parity for the current browser surface: dashboard, repositories, repo detail, sessions, achievements, settings, and explicit operator actions
- [x] keep the product server-first enough to preserve static page shells with client-side hydration against the live Go API
- [x] preserve first-run guidance and manual action feedback in the new web frontend
- [x] make Go serve the built frontend assets in non-dev paths

Exit criteria:

- [x] `gitpulse serve` works end to end without `python-ui/` in the request path
- [x] the browser surface no longer needs FastAPI, Jinja2, htmx, or Alpine.js
- [x] the shipped browser workflow still matches the manual-first operating model

### [ ] Phase 4 - Add the OpenTUI operator console

Status notes:

- `frontend/tui/` now contains a keyboard-driven source-run terminal preview that talks to the live Go API through the shared TypeScript client.
- The Cobra CLI now exposes `gitpulse tui` to launch the terminal preview through Bun.
- The preview covers dashboard, repositories, repository detail, sessions, achievements, settings, manual runbook actions, and explicit backend error states.
- The repositories screen now supports selected-repo quick actions, and repository detail can step across adjacent tracked repos without dropping back to the list or falling through to CLI selectors.
- Phase 4 is still open because the terminal lane still needs broader real-workspace validation and a stronger case that it is materially better than chaining the CLI across a fuller operator session.

Deliverables:

- [x] add `frontend/tui`
- [x] introduce a dedicated terminal entrypoint, preferably `gitpulse tui`
- [x] implement the operator-critical workflow first: repository list and detail, action center, sessions summary, achievements summary, settings basics, and clear error states
- [ ] optimize for keyboard flow, visibility, and speed rather than page-for-page web mimicry

Exit criteria:

- [ ] a developer can run the daily GitPulse loop comfortably from the TUI
- [ ] the TUI is materially better than chaining CLI commands for inspection and control
- [ ] the CLI still exists as the low-level fallback

### [x] Phase 5 - Remove Python UI and tighten the repo

Status notes:

- `gitpulse serve` no longer launches a managed Python subprocess.
- README, architecture docs, operator docs, AGENTS notes, and CI now describe the active Go + Bun lanes.
- The legacy `python-ui/` directory and its stale assets are gone from the repo.
- Desktop packaging remains out of scope for the migration itself.

Deliverables:

- [x] remove the remaining `python-ui/` directory and legacy assets once the reference is no longer needed
- [x] remove managed Python UI launch and proxy code
- [x] remove Python UI docs and verification steps from current repo docs and CI
- [x] update README and architecture and operator docs to reflect the active Go + Bun frontend shape
- [x] keep desktop packaging out of scope unless the repo implements it separately

Exit criteria:

- [x] no Python runtime dependency remains for shipped GitPulse frontend behavior
- [x] docs and CI describe only the active Go + Bun lanes
- [x] stale Python-browser reference code is gone from the repo

## Recommended execution order

- [x] **Phase 0** - write the parity matrix first
- [x] **Phase 1** - stabilize the Go API and action contract
- [x] **Phase 2** - create the shared TypeScript foundation
- [x] **Phase 3** - replace the browser UI and cut over `gitpulse serve`
- [ ] **Phase 4** - add the OpenTUI operator console
- [x] **Phase 5** - remove the legacy Python UI directory and finish cleanup

### Ordering rules

- Do **not** start the real TUI before the backend contract and shared TypeScript layer exist.
- Keep the web replacement shipped before the TUI because the browser dashboard is already a current product surface.

## Risks

- The current API may still need small contract adjustments once the TUI starts real work.
- It is easy to build a ceremonial TUI. The TUI must improve operator speed, not just mirror pages.
- Bun-based frontends add a second toolchain beside Go. Keep boundaries clean and CI explicit.
- Docs can accidentally imply background tracking, plugins, or desktop packaging if the cutover is described sloppily.

## Acceptance criteria

This migration is done when all of the following are true:

- [x] Go is still the only backend and source of truth.
- [x] SQLite and plain SQL remain the active storage path.
- [x] `gitpulse serve` serves the shipped web frontend without launching a Python subprocess.
- [x] The web frontend covers the current browser product surface.
- [ ] The TUI covers the operator-critical daily workflow well enough to justify its existence.
- [x] The CLI remains functional for explicit control paths.
- [x] Repo docs describe the new frontend reality without claiming unshipped automation or packaging.
- [x] CI and verification cover the active Go + Bun lanes only.

## Minimum verification for future implementation phases

Use the narrowest truthful checks first.

- Go contract work: `go test ./...`
- Web frontend work: `cd frontend && bun install && bun run check && bun run --filter @gitpulse/web build`
- TUI work: `cd frontend && bun run check && bun run --filter @gitpulse/tui test`
- Cutover work: add one focused `gitpulse serve` smoke run and one focused `gitpulse tui` smoke run once those surfaces exist

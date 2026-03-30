# GitPulse BUILD

Purpose: phased frontend migration plan from the current Python browser UI to GitPulse's next frontend shape.

## Frontend decision

**Target shape: dual frontend**

- **Backend:** keep **Go** as the only backend and system of record
- **Web frontend:** **TypeScript + Bun + Astro + Vue**
- **Terminal frontend:** **TypeScript + Bun + OpenTUI**
- **Removal target:** retire `python-ui/` after web parity and cutover

### Why this is the right target

GitPulse already has two real operator surfaces today:

- a CLI for explicit control
- a local browser dashboard for inspection, settings, and runbook actions

A terminal-first operator console is justified because the product is local-first, manual-first, and aimed at developers who already live in the terminal. A browser surface still matters for dashboards, detail pages, and settings. That makes **dual frontend** the right target.

This repo should **not** go web-only unless the TUI later proves redundant, and it should **not** go TUI-primary before the web cutover because the browser dashboard is already a shipped surface.

## Current state

- Go owns runtime orchestration, CLI commands, JSON API, analytics, and SQLite access.
- SQLite with plain SQL is the active storage model.
- `gitpulse serve` starts the Go server, launches `python-ui/` as a managed subprocess, and reverse-proxies browser traffic to it.
- `python-ui/` is FastAPI + Jinja2 + htmx + Alpine.js.
- The supported operator loop is still manual-first: **add -> import -> rescan -> rebuild -> inspect**.
- Background watchers, pollers, desktop packaging, and plugin runtime work are not current product truth.

## Target state

GitPulse should converge on this shape:

```text
cmd/gitpulse/               # Go CLI, serve command, future tui command
internal/...                # Go runtime, DB, API, analytics, orchestration
frontend/
  shared/                   # shared TS API client, types, formatters, state helpers
  web/                      # Astro + Vue app
  tui/                      # OpenTUI app
```

Target behavior:

- Go remains the only backend and owns persistence, analytics, config, and API contracts.
- `gitpulse serve` serves the Astro build directly from Go in non-dev paths.
- A new terminal entrypoint, preferably `gitpulse tui`, becomes the terminal operator console.
- Both frontends consume the same Go-owned API and shared TypeScript client/types.
- Python stops being a runtime dependency once the web cutover is complete.

## Backend notes

- **Do not rewrite the backend in Python.** Go is the correct backend lane for this repo.
- Keep SQLite. GitPulse is deliberately local-first and single-operator today.
- Keep plain SQL unless backend query complexity clearly earns `sqlc` later.
- Keep the CLI as a first-class control surface even after the TUI exists.
- Promote the Go API from "good enough for the Python UI" to "stable enough for two first-class frontends."
- Frontends may shape presentation, but they must not own analytics, config truth, or persistence rules.

## Data and runtime constraints

- Local-first is non-negotiable. No source upload. No cloud dependency for core use.
- Manual-first is still current product truth. Do not smuggle in watchers or pollers as part of the frontend migration.
- Browser and terminal flows must preserve the explicit runbook actions: add, import, rescan, rebuild, inspect.
- Repo-controlled strings remain untrusted input in both frontends.
- `gitpulse serve` must stop depending on a managed Python subprocess by the end of this plan.
- Desktop packaging stays out of scope for this migration.
- Keep same-origin behavior boring. The Go runtime remains the single local app boundary.

## Phase plan

### Phase 0 - Lock the contract before replacing UI

Deliverables:

- inventory current Python UI routes, pages, actions, and API dependencies
- write a page and workflow parity matrix for: dashboard, repositories, repo detail, sessions, achievements, settings, and operator actions
- define the target `frontend/` workspace layout and ownership boundaries
- identify API/view-model gaps that are currently Python-UI-shaped

Exit criteria:

- parity scope is explicit before new UI work starts
- Go API gaps are listed as backend tasks, not hidden frontend surprises
- future subagents can work from a bounded checklist

### Phase 1 - Harden the Go frontend contract

Deliverables:

- make the Go API and action endpoints explicit enough for both frontends
- normalize response shapes so they are frontend-facing rather than template-shaped
- add focused tests for dashboard, repositories, actions, sessions, achievements, and settings endpoints
- keep all orchestration, validation, and persistence in Go

Exit criteria:

- new frontends can consume a stable contract without Python-specific glue
- manual operator actions are represented cleanly in the API
- backend tests cover the migration-critical surfaces

### Phase 2 - Create the shared TypeScript foundation

Deliverables:

- create a Bun workspace under `frontend/`
- add `frontend/shared` for API client code, shared types, formatting helpers, and common domain utilities
- define route and screen maps for web and TUI against the same domain model
- wire local dev against the live Go backend

Exit criteria:

- one shared TS contract exists for both frontends
- both frontend lanes can boot against the current Go runtime
- no frontend-specific type drift is required to talk to Go

### Phase 3 - Replace the browser UI with Astro + Vue

Deliverables:

- build the web app in `frontend/web`
- reach feature parity for the current browser surface: dashboard, repositories, repo detail, sessions, achievements, settings, and explicit operator actions
- keep the product server-first. Astro owns pages; Vue owns interactive islands only where needed.
- preserve first-run guidance and manual action feedback
- make Go serve the built frontend assets in non-dev paths

Exit criteria:

- `gitpulse serve` works end to end without `python-ui/` in the request path
- the browser surface no longer needs FastAPI, Jinja2, htmx, or Alpine.js
- the shipped browser workflow still matches the manual-first operating model

### Phase 4 - Add the OpenTUI operator console

Deliverables:

- add `frontend/tui`
- introduce a dedicated terminal entrypoint, preferably `gitpulse tui`
- implement the operator-critical workflow first: repository list/detail, action center, sessions summary, achievements summary, settings basics, and clear error states
- optimize for keyboard flow, visibility, and speed rather than page-for-page web mimicry

Exit criteria:

- a developer can run the daily GitPulse loop comfortably from the TUI
- the TUI is materially better than chaining CLI commands for inspection and control
- the CLI still exists as the low-level fallback

### Phase 5 - Remove Python UI and tighten the repo

Deliverables:

- remove `python-ui/` and managed Python UI launch/proxy code once web cutover is complete
- remove Python UI docs and verification steps from repo docs and CI
- update README and architecture/operator docs to reflect the active Go + Bun frontend shape
- keep desktop packaging out of scope unless the repo implements it separately

Exit criteria:

- no Python runtime dependency remains for shipped GitPulse frontend behavior
- docs and CI describe only the active Go + Bun lanes
- stale Python-browser wording is gone from current-state docs

## Recommended execution order

1. **Phase 0** - write the parity matrix first
2. **Phase 1** - stabilize the Go API and action contract
3. **Phase 2** - create the shared TS foundation
4. **Phase 3** - replace the browser UI and cut over `gitpulse serve`
5. **Phase 4** - add the OpenTUI operator console
6. **Phase 5** - remove Python UI and clean the repo

### Ordering rules

- Do **not** start the TUI before the backend contract and shared TS layer exist.
- Do **not** remove Python before the Astro + Vue browser surface is clearly at parity.
- Ship the web replacement before the TUI because the browser dashboard already exists in production truth.

## Risks

- The current API may still be shaped around Python template needs rather than durable frontend contracts.
- Web parity can drift if migration starts without a route-by-route checklist.
- It is easy to build a ceremonial TUI. The TUI must improve operator speed, not just mirror pages.
- Bun-based frontends add a second toolchain beside Go. Keep boundaries clean and CI explicit.
- Docs can accidentally imply background tracking, plugins, or desktop packaging if the cutover is described sloppily.

## Acceptance criteria

This migration is done when all of the following are true:

- Go is still the only backend and source of truth.
- SQLite and plain SQL remain the active storage path.
- `gitpulse serve` serves the shipped web frontend without launching a Python subprocess.
- The web frontend covers the current browser product surface.
- The TUI covers the operator-critical daily workflow well enough to justify its existence.
- The CLI remains functional for explicit control paths.
- Repo docs describe the new frontend reality without claiming unshipped automation or packaging.
- CI and verification cover the active Go + Bun lanes only.

## Minimum verification for future implementation phases

Use the narrowest truthful checks first.

- Go contract work: `go test ./...`
- Web frontend work: `cd frontend/web && bun install && bunx biome check . && bunx astro check && bun test`
- TUI work: `cd frontend/tui && bun install && bunx biome check . && bunx tsc --noEmit && bun test`
- Cutover work: add one focused `gitpulse serve` smoke run and one focused `gitpulse tui` smoke run once those surfaces exist

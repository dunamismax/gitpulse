# GitPulse BUILD

Purpose: phased frontend migration plan from the current Python browser UI to GitPulse's next frontend shape.

## Decision

**Target frontend:** dual frontend

- **Backend:** keep **Go** as the only backend and system of record
- **Web frontend:** **TypeScript + Bun + Astro + Vue**
- **Terminal frontend:** **TypeScript + Bun + OpenTUI**
- **Removal target:** retire `python-ui/` after web parity and cutover

This repo already has two real operator surfaces: a CLI-first workflow and a browser dashboard. A richer terminal surface is justified because GitPulse is local-first, manual-first, and aimed at developers who already live in the terminal. The browser still matters for dashboards, settings, and longer-form inspection. That makes **dual frontend** the right target, not web-only.

## Current state

- Go owns runtime orchestration, CLI commands, JSON API, analytics, and SQLite access.
- SQLite with plain SQL is the active storage model.
- `gitpulse serve` starts the Go server, launches `python-ui/` as a managed subprocess, and reverse-proxies browser traffic to it.
- The Python UI is FastAPI + Jinja2 + htmx + Alpine.js.
- The supported operator loop is still manual-first: **add -> import -> rescan -> rebuild -> inspect**.
- Packaged desktop releases, background watchers, and pollers are not current product truth.

## Target state

GitPulse should converge on this shape:

```text
cmd/gitpulse/               # Go CLI, serve command, future tui command
internal/...                # Go runtime, DB, API, analytics, orchestration
frontend/
  shared/                   # shared TS API client, types, formatting helpers
  web/                      # Astro + Vue app
  tui/                      # OpenTUI app
```

Target behavior:

- Go remains the only backend and owns persistence, analytics, config, and API contracts.
- `gitpulse serve` serves the Astro build directly from Go in production paths. Dev proxying is acceptable during migration.
- A new terminal entrypoint, likely `gitpulse tui`, becomes the primary operator console for terminal-native workflows.
- Both frontends consume the same Go-owned API and shared TypeScript client/types.
- Python stops being a runtime dependency once the web cutover is complete.

## Backend notes

- **Do not rewrite the backend in Python.** Go is the correct lane for this repo.
- Keep SQLite. This repo is deliberately local-first and single-operator today.
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
- Do not document desktop packaging during this migration.
- Keep same-origin behavior boring. The Go runtime should remain the single local app boundary.

## Phases

### Phase 0 - Freeze the contract before replacing UI

Deliverables:

- inventory current Python UI routes, pages, actions, and API dependencies
- define the target frontend workspace layout under `frontend/`
- write a parity checklist for: dashboard, repositories, repo detail, sessions, achievements, settings, and operator actions
- identify API/view-model gaps that are currently Python-UI-specific

Exit criteria:

- future work has a page-by-page parity matrix
- the Go API gaps for new frontends are explicit
- the cutover scope is bounded before new UI code starts

### Phase 1 - Harden the Go frontend contract

Deliverables:

- make the Go API and action endpoints explicit enough for both frontends
- normalize response shapes so they are frontend-agnostic rather than template-shaped
- add focused tests for the endpoints that power dashboard, repositories, actions, sessions, achievements, and settings
- keep all orchestration and persistence in Go

Exit criteria:

- new frontends can consume a stable contract without Python-specific glue
- manual operator actions are represented cleanly in the API
- backend tests cover the surfaces needed for the migration

### Phase 2 - Create shared TypeScript foundation

Deliverables:

- create a Bun workspace under `frontend/`
- add `frontend/shared` for API client code, shared types, and common formatting/utilities
- define route and screen maps for web and TUI against the same domain model
- wire local dev against the live Go backend

Exit criteria:

- one shared TS contract exists for both frontends
- both frontend lanes can boot against the current Go runtime

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
- the current manual-first browser workflow is preserved

### Phase 4 - Add the OpenTUI operator console

Deliverables:

- add `frontend/tui`
- introduce a dedicated terminal entrypoint, preferably `gitpulse tui`
- implement the operator-critical workflow first: repository list/detail, action center, sessions summary, achievements summary, settings basics, and clear error states
- favor keyboard-first flows over page parity theater

Exit criteria:

- a developer can run the daily GitPulse loop comfortably from the TUI
- the TUI is materially better than chaining CLI commands for inspection and control
- the CLI still exists as the low-level fallback

### Phase 5 - Remove Python UI and tighten the repo

Deliverables:

- remove `python-ui/` and managed Python UI launch/proxy code once web cutover is complete
- remove Python UI docs and verification steps from repo docs and CI
- update README, architecture docs, workflow docs, and contributing docs to reflect the new frontend shape
- keep desktop packaging out of scope unless the repo implements it separately

Exit criteria:

- no Python runtime dependency remains for shipped GitPulse frontend behavior
- docs and CI describe only the active Go + Bun stack
- old browser-stack wording is gone from current-state docs

## Recommended execution order

1. **Phase 0** - write the parity matrix first
2. **Phase 1** - make the Go API/frontend boundary stable
3. **Phase 2** - create shared TS foundation
4. **Phase 3** - replace the browser UI and cut over `gitpulse serve`
5. **Phase 4** - add the OpenTUI operator console
6. **Phase 5** - remove Python UI and clean the repo

Do not start the TUI before the backend contract and shared TS layer exist. Do not remove Python before the Astro + Vue browser surface is clearly at parity.

## Risks

- The current API may still be shaped around Python template needs rather than durable frontend contracts.
- Web parity can drift if the migration starts without a route-by-route checklist.
- It is easy to build a ceremonial TUI. The TUI must improve operator speed, not just mirror pages.
- Bun-based frontends add a second toolchain beside Go. Keep boundaries clean and CI explicit.
- Docs can accidentally imply background tracking or desktop packaging if the cutover is described sloppily.

## Acceptance criteria

This migration is done when all of the following are true:

- Go is still the only backend and source of truth.
- SQLite and plain SQL remain the active storage path.
- `gitpulse serve` serves the shipped web frontend without launching a Python subprocess.
- The web frontend covers the current browser product surface.
- The TUI covers the operator-critical daily workflow well enough to justify its existence.
- The CLI remains functional for explicit control paths.
- Repo docs describe the new frontend reality without claiming unshipped background automation or packaging.
- CI and verification cover the active Go + Bun lanes only.

## Minimum verification for each future migration phase

Use the narrowest truthful checks first.

- Go contract work: `go test ./...`
- Web frontend work: `cd frontend/web && bun install && bunx biome check . && bunx astro check && bun test`
- TUI work: `cd frontend/tui && bun install && bunx biome check . && bunx tsc --noEmit && bun test`
- Cutover work: add one focused `gitpulse serve` smoke run and one focused `gitpulse tui` smoke run once those surfaces exist

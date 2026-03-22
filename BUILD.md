# BUILD.md

## Purpose

This file is the execution manual for GitPulse.

It keeps the repo honest while the product grows from foundation into a stable, shippable developer analytics platform. At any point it should answer:

- what GitPulse is trying to become
- what exists right now
- what is explicitly not built yet
- what the next correct move is
- what must be proven before stronger claims are made

If deeper design docs exist under `docs/`, link them here instead of replacing this file. Claims about verification, product behavior, release posture, and open risks should stay explicit here rather than living in chat memory.

This is a living document. When code and docs disagree, fix them together in the same change.

---

## Mission

Deliver trustworthy personal repository analytics without uploading source code or diff contents, by:

- **Separating the ledgers** — live work, committed work, and pushed work are tracked independently because they mean different things
- **One runtime, every shell** — CLI, local web, and desktop share the same Rust engine and data model instead of drifting apart
- **Inspectable persistence** — raw events, derived rollups, and gamified score remain distinct and rebuildable from event data
- **Local-first, always** — no cloud service, no diff upload, no token required for core functionality; GitHub integration is optional and supplemental
- **Privacy-first growth** — team analytics, if ever built, stay opt-in and never become surveillance tooling
- **Platform ambitions** — grow toward a plugin-extensible platform with a REST API, multi-device sync, and IDE integrations without abandoning local-first principles

---

## Repo snapshot

**Current phase: v1 stabilization — Phase 7 (Desktop confidence) in progress**

Last reviewed: 2026-03-22
Host: macOS, `/Users/sawyer/github/gitpulse`
Branch: `main`
Toolchain: `cargo 1.94.0`, `rustc 1.94.0`, `git 2.50.1`, `sqlite3 3.51.0`

What exists:

- Local web dashboard with Axum + Askama + HTMX
- Thin Tauri v2 desktop shell over the same runtime/web stack
- Parent-folder repo discovery and direct repo add flows
- Recent-history commit import for tracked repositories
- Working-tree and staged diff snapshots with untracked text-file line counting
- Local push detection from ahead/behind transitions with optional GitHub verification
- Focus sessions, daily rollups, streaks, goals, score, and achievements
- Per-repo include/exclude override editing from the repository detail page
- Explicit `rebuild-rollups` CLI maintenance path
- CI wiring for format, clippy, nextest, cargo-deny, and a native macOS desktop compile lane
- Repeatable desktop startup smoke path via `./scripts/desktop-smoke.sh`
- Documented operator-run macOS `.app` packaging flow via `./scripts/desktop-package.sh`

What does **not** exist yet:

- Team or cloud mode
- Mobile client
- Explicit history-purge UI
- Retroactive rewrite of stored file-activity history when repo-specific patterns change
- CI-built or signed/notarized desktop release artifacts
- REST API or plugin system
- Multi-device sync

Observed `origin` remote (dual-push convention):

- fetch: `git@github.com-dunamismax:dunamismax/gitpulse.git`
- push: `git@github.com-dunamismax:dunamismax/gitpulse.git`
- push: `git@codeberg.org-dunamismax:dunamismax/gitpulse.git`

---

## Source-of-truth mapping

| File | Owns |
|------|------|
| `BUILD.md` | Execution phases, verification history, decisions, handoff rules |
| `README.md` | User-facing product story and local run instructions |
| `ROADMAP.md` | Public-facing product vision and milestones |
| `CONTRIBUTING.md` | Development setup and contribution workflow |
| `CHANGELOG.md` | Release history |
| `AGENTS.md` | Concise repo memory for future contributors |
| `docs/architecture.md` | Crate boundaries and data flow |
| `docs/metrics.md` | Metric semantics, caveats, and interpretation |
| `docs/desktop-release.md` | Desktop packaging scope and operator workflow |
| `docs/plugin-architecture.md` | Plugin/extension system design (planned) |
| `Cargo.toml` | Workspace members, dependency policy, lint policy, release profile |
| `rust-toolchain.toml`, `rustfmt.toml`, `clippy.toml`, `deny.toml` | Toolchain pinning and lint config |
| `.github/workflows/ci.yml` | CI truth for automated validation |
| `migrations/0001_init.sql` | Database schema baseline |
| `gitpulse.example.toml` | Config example surface |
| `scripts/desktop-smoke.sh` | Release-critical local desktop startup gate |
| `scripts/desktop-package.sh` | macOS `.app` bundle helper |
| `crates/gitpulse-core/src/*` | Domain rules: score, streaks, sessions, timezone, shared types |
| `crates/gitpulse-infra/src/*` | Config, dirs, database, git integration, exclusions, watcher, GitHub |
| `crates/gitpulse-runtime/src/*` | Orchestration, analytics rebuild flow |
| `crates/gitpulse-web/src/*` | Web routes and server-side page composition |
| `apps/gitpulse-cli/src/main.rs` | CLI entrypoint behavior |
| `apps/gitpulse-desktop/src/main.rs` | Desktop entrypoint behavior |

**Invariant:** If docs, code, and CLI output ever disagree, the next change must reconcile all three.

---

## Working rules

1. **Read BUILD.md first.** Any substantial repo work starts here. Then read `AGENTS.md`, `README.md`, `docs/architecture.md`, and `docs/metrics.md` before changing product semantics.
2. **Respect crate boundaries.** Product rules in `gitpulse-core`, integration boundaries in `gitpulse-infra`, orchestration in `gitpulse-runtime`, presentation in `gitpulse-web` or app shells.
3. **Schema changes are deliberate.** Treat `migrations/0001_init.sql` as the schema baseline. If the data model changes, migrate it and update docs in the same pass.
4. **Metric changes require a sweep.** If metric semantics change, update `docs/metrics.md`, relevant tests, and this file together.
5. **Regression tests ride with behavior.** If git parsing, repo discovery, analytics rebuilds, or missing-repo handling change, prefer regression coverage in `crates/gitpulse-infra/tests/` or `crates/gitpulse-runtime/tests/`.
6. **Desktop packaging changes need doc updates.** If desktop packaging or release posture changes, also read and update `docs/desktop-release.md` in the same pass.
7. **Routes and templates stay aligned.** If routes, templates, or HTMX partial behavior change, keep route smoke tests and template paths in sync.
8. **Repo-controlled strings are untrusted input.** Paths, file names, branch names, and language labels must be escaped in HTML, SVG, and logs.
9. **Done means done.** Do not mark work complete until the artifact exists and the commands that were actually run are recorded truthfully.
10. **Decisions go in the decision log.** When behavior intentionally changes or scope is consciously deferred, record it instead of leaving it implicit.

---

## Tracking conventions

Use this language consistently in docs, commits, and handoff notes:

| Term | Meaning |
|------|---------|
| **done** | Implemented and verified |
| **in progress** | Actively being worked on |
| **not started** | Intentional, not yet begun |
| **blocked** | Cannot proceed without a decision or dependency |
| **risk** | Plausible failure mode that could distort the design |
| **decision** | A durable call with consequences |

### Progress log format

- `YYYY-MM-DD: scope - outcome. Verified with: <commands>. Next: <follow-up>.`

### Decision log format

- `YYYY-MM-DD: decision - rationale - consequence.`

When new work lands, update: repo snapshot, phase dashboard, decisions (if architecture changed), and progress log with date and what was verified.

---

## Quality gates

### Local gate

```bash
cargo check --workspace --exclude gitpulse-desktop
cargo test --workspace --exclude gitpulse-desktop
cargo nextest run --workspace --exclude gitpulse-desktop
cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings
cargo test -p gitpulse-runtime --test runtime_integration
cargo clippy -p gitpulse-runtime --tests -- -D warnings
cargo check -p gitpulse-desktop
./scripts/desktop-smoke.sh
cargo run -p gitpulse-cli -- rebuild-rollups
cargo run -p gitpulse-cli -- doctor
```

### CI gate

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings
cargo nextest run --workspace --exclude gitpulse-desktop
cargo deny check
cargo check -p gitpulse-desktop    # macos-latest only
```

If a gate is temporarily unavailable or has not been locally verified, document why. Never silently skip. Do not present CI-only commands as locally verified unless a future pass explicitly re-verifies them here.

---

## Dependency strategy

GitPulse uses the Rust ecosystem with deliberate dependency choices:

| Dependency | Purpose | Justification |
|------------|---------|---------------|
| `sqlx` + `sqlite` | Persistence | Compile-time query checking, async-ready, bundles SQLite |
| `axum` | Web server | Tokio-native, composable, tower middleware ecosystem |
| `askama` | Templates | Compile-time template checking, zero runtime overhead |
| `tauri` | Desktop shell | Native window with web content, folder picker, small binary |
| `tokio` | Async runtime | Required by axum and sqlx, mature ecosystem |
| `serde` + `toml` | Config | Standard serialization, TOML for human-readable config |
| `reqwest` | GitHub API | Optional dependency, only for push verification |
| `notify` | File watcher | Cross-platform filesystem events |

Every future dependency must justify itself. Prefer the standard library or existing dependencies over new ones.

---

## Currently verified commands

These commands are recorded as having actually passed in this repository. Do not add to this list unless the command was really run.

Verified on `2026-03-20`:

- `cargo check --workspace --exclude gitpulse-desktop`
- `cargo test --workspace --exclude gitpulse-desktop`
- `cargo nextest run --workspace --exclude gitpulse-desktop`
- `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`
- `cargo test -p gitpulse-runtime --test runtime_integration`
- `cargo clippy -p gitpulse-runtime --tests -- -D warnings`
- `cargo check -p gitpulse-desktop`
- `cargo run -p gitpulse-cli -- rebuild-rollups`
- `cargo run -p gitpulse-cli -- doctor`

Verified on `2026-03-21`:

- `cargo test -p gitpulse-runtime --test runtime_integration`
- `cargo check -p gitpulse-runtime`
- `cargo clippy -p gitpulse-runtime --tests -- -D warnings`
- `cargo check -p gitpulse-desktop`
- `cargo run -p gitpulse-cli -- doctor`
- `cargo run -p gitpulse-desktop`

Verified on `2026-03-22`:

- `cargo fmt --all`
- `cargo test -p gitpulse-runtime --test runtime_integration`
- `cargo test -p gitpulse-web`
- `cargo test -p gitpulse-core`
- `cargo test -p gitpulse-infra`
- `cargo check --workspace --exclude gitpulse-desktop`
- `cargo check -p gitpulse-desktop`
- `./scripts/desktop-smoke.sh`

---

## Target architecture

### Crate boundaries

- **`gitpulse-core`** — Pure-ish domain rules and shared types. Score, streak, session, and timezone/day-boundary logic. Settings and analytics model types.
- **`gitpulse-infra`** — External boundaries. SQLite/SQLx, migrations, config, app directories, git parsing, repo discovery, exclusions, watchers, and optional GitHub verification.
- **`gitpulse-runtime`** — Application orchestration. Add target, discover repos, import history, refresh snapshots, detect pushes, rebuild analytics, and serve data to UI/CLI consumers.
- **`gitpulse-web`** — Axum routes, Askama templates, HTMX partials, and SVG chart rendering. Should stay presentation-oriented and avoid owning product rules.
- **`gitpulse-cli`** — Headless operator and diagnostics entrypoint.
- **`gitpulse-desktop`** — Thin Tauri shell that hosts the same localhost UI and exposes native folder picking where available.

### Data flow

1. A repo root or parent folder is added through CLI or UI.
2. The runtime discovers tracked repositories and persists them.
3. Initial history import reads qualifying commit metadata through the git CLI.
4. A debounced watcher plus periodic polling enqueues refresh work.
5. Refreshes collect canonical repo state: branch/head/upstream metadata, ahead/behind counts, working-tree and staged numstat diffs, untracked text additions, periodic language/size snapshots.
6. The runtime writes snapshots and event records into SQLite.
7. Analytics rebuilds derive sessions, daily rollups, streaks, score, goals, and achievements.
8. Axum + Askama + HTMX pages read those derived views for dashboard and drill-down pages.
9. The desktop shell reuses the same runtime and routes instead of introducing a separate implementation.

---

## Product principles

1. **Local-first first.** GitPulse should remain useful with no cloud service, no diff upload, and no token configured.
2. **One product, multiple shells.** CLI, local web, and desktop should share the same runtime and data model rather than drifting apart.
3. **Separate the ledgers.** Live work, commit history, push history, derived rollups, and score should stay conceptually separate.
4. **Rebuildable analytics.** Raw events should remain rich enough that sessions, rollups, and achievements can be recalculated intentionally.
5. **Thin surfaces.** `gitpulse-web` and `gitpulse-desktop` should stay thin compared with `gitpulse-runtime`, `gitpulse-infra`, and `gitpulse-core`.
6. **Git truth comes from the git boundary.** Canonical repo state should come from git snapshots and persisted events, not from raw watcher noise.
7. **Explicit caveats beat false precision.** Approximate metrics are fine if the approximation is documented and the UI does not pretend otherwise.
8. **Repo-controlled strings are untrusted input.** Paths, file names, branch names, and language labels should not be treated as safe just because the app is local-first.
9. **Docs and tests move with behavior.** If metric semantics, runtime behavior, or operator workflows change, update docs and regression coverage in the same pass.

---

## Parallel work lanes

| Lane | Focus | Write surface |
|------|-------|---------------|
| A | Docs, metrics semantics, handoff accuracy | `BUILD.md`, `README.md`, `AGENTS.md`, `docs/*` |
| B | Core product rules | `crates/gitpulse-core/` |
| C | Infra and persistence | `crates/gitpulse-infra/`, `migrations/` |
| D | Runtime orchestration and analytics rebuild | `crates/gitpulse-runtime/` |
| E | Web routes, templates, and assets | `crates/gitpulse-web/`, `assets/` |
| F | Desktop shell, CLI, CI/release plumbing | `apps/`, `scripts/`, `.github/workflows/`, workspace policy files |

### Coordination rules

- Keep file ownership disjoint when multiple contributors work in parallel.
- If a change crosses crate boundaries, update the architecture notes or phase notes in this file in the same change set.
- Prefer adding the regression test in the same lane that introduces the behavior change.
- Avoid duplicating metric semantics across multiple docs; document them once in `docs/metrics.md` and link back here when needed.

---

## Phase dashboard

### v1 — Local-first foundation

| Phase | Name | Status |
|-------|------|--------|
| 0 | Product charter and source-of-truth capture | **Done** |
| 1 | Workspace, schema, and infrastructure foundation | **Done** |
| 2 | Runtime orchestration and analytics model | **Done** |
| 3 | Web dashboard and shared product surfaces | **Done** |
| 4 | Correctness hardening and regression coverage | **Done** |
| 5 | Trust and output hardening | **Done** |
| 6 | Performance and rebuild strategy | Not started |
| 7 | Desktop confidence and release operations | **In progress** |
| 8 | Data lifecycle and operator controls | Not started |
| 9 | v1 stabilization and release readiness | Not started |

### v2 — Platform and extensibility

| Phase | Name | Status |
|-------|------|--------|
| 10 | REST API and programmatic access | Not started |
| 11 | Plugin and extension system | Not started |
| 12 | Advanced analytics and insights | Not started |
| 13 | Cross-platform desktop releases | Not started |
| 14 | Notifications and alerting | Not started |

### v3 — Connectivity and ecosystem

| Phase | Name | Status |
|-------|------|--------|
| 15 | Multi-device sync (optional, encrypted) | Not started |
| 16 | IDE integrations | Not started |
| 17 | External service integrations | Not started |
| 18 | Team and organization analytics (opt-in) | Not started |
| 19 | Mobile companion | Not started |

---

## Detailed phase plan

### Phase 0 — Product charter and source-of-truth capture
**Status: done**

Goals:
- [x] Establish `BUILD.md` as the canonical handoff document
- [x] Establish `README.md` as the user-facing overview and quick-start doc
- [x] Establish `AGENTS.md` as concise repo memory for future contributors
- [x] Capture architecture and metric semantics in dedicated docs under `docs/`
- [x] Make the local-first, no-source-upload product stance explicit
- [x] Document that live work, committed work, and pushed work are separate product concepts

Exit criteria:
- [x] Contributors can tell what GitPulse is, how it is structured, and where truth lives without reverse-engineering the repo

---

### Phase 1 — Workspace, schema, and infrastructure foundation
**Status: done**

Goals:
- [x] Land the Rust workspace with the current app and crate split
- [x] Add the SQLite schema baseline under `migrations/0001_init.sql`
- [x] Wire config loading, app directories, and persistence bootstrapping
- [x] Implement git CLI integration for discovery, status snapshots, and history import
- [x] Implement watcher support and repo refresh enqueueing
- [x] Provide the CLI surface for operating the app locally

Exit criteria:
- [x] A fresh clone has an understandable Rust-first entrypoint and a persistent local data model

---

### Phase 2 — Runtime orchestration and analytics model
**Status: done**

Goals:
- [x] Add tracked-target and repository discovery flows
- [x] Add recent-history import for tracked repos
- [x] Add live working-tree and staged snapshotting
- [x] Add ahead/behind-based local push detection plus optional GitHub verification
- [x] Persist snapshots, file activity, commits, pushes, settings, sessions, rollups, and achievements
- [x] Rebuild analytics from ledger data into sessions, streaks, score, goals, and achievements
- [x] Keep timezone/day-boundary behavior explicit and configurable

Exit criteria:
- [x] GitPulse can build a meaningful local analytics picture from tracked repositories and stored event data

---

### Phase 3 — Web dashboard and shared product surfaces
**Status: done**

Goals:
- [x] Land the Axum + Askama + HTMX local web dashboard
- [x] Land dashboard, repositories, repo detail, sessions, achievements, and settings pages
- [x] Add server-side SVG chart rendering
- [x] Add repository detail editing for repo-specific include/exclude overrides
- [x] Keep the Tauri desktop shell thin and pointed at the same runtime/web surface

Exit criteria:
- [x] The app has a usable local UI and a desktop shell without splitting the product into multiple implementations

---

### Phase 4 — Correctness hardening and regression coverage
**Status: done**

Goals:
- [x] Fix repeated history imports so historical file-activity rows are not duplicated on re-import
- [x] Fix staged snapshot propagation into daily rollups so dashboard staged totals reflect reality
- [x] Add regression coverage for both import idempotency and staged-rollup behavior
- [x] Harden missing-repo startup handling so missing watched repos disable cleanly instead of aborting bootstrap
- [x] Make periodic/background enqueue and bulk rescan flows skip repositories that are not actively monitored
- [x] Add regression coverage for missing-repo bootstrap and refresh-after-disappearance behavior

Exit criteria:
- [x] The known high-priority correctness issues from the 2026-03-20 review are fixed and covered by regression tests

---

### Phase 5 — Trust and output hardening
**Status: done**

Goals:
- [x] Escape or structurally render repo-detail SVG labels instead of injecting raw text into trusted SVG output
- [x] Add regression coverage for chart-label escaping or equivalent safe rendering behavior
- [x] Audit remaining repo-controlled strings rendered through templates, SVG helpers, or other trusted sinks
- [x] Re-check docs wording so the app's local-first trust story matches the implementation after the rendering hardening lands

Exit criteria:
- [x] Repo-controlled text is no longer treated as implicitly safe in rendered chart output
- [x] There is at least one targeted regression test covering the resolved rendering path

---

### Phase 6 — Performance and rebuild strategy
**Status: not started**

Goals:
- [ ] Decide whether full-history synchronous `rebuild_analytics()` remains acceptable for v1 datasets
- [ ] If not, design and implement an incremental or scoped rebuild strategy without losing auditability
- [ ] Add measurement or benchmark coverage for analytics rebuild cost on larger histories
- [ ] Document the operator story for expensive rebuilds, long import histories, and many-repo datasets
- [ ] Keep raw-event versus derived-rollup boundaries explicit even if rebuild implementation changes

Exit criteria:
- [ ] The scalability story is explicit rather than assumed
- [ ] The repo has a believable answer for long-lived datasets beyond small demo usage

Risks:
- **risk:** full-history synchronous rebuilds may become noticeably slow as tracked repo count and commit history grow
- **risk:** incremental rebuilds add complexity that may introduce subtle correctness regressions

---

### Phase 7 — Desktop confidence and release operations
**Status: in progress**

Goals:
- [x] Keep `gitpulse-desktop` as a thin shell over the shared runtime and local web UI
- [x] Maintain at least a desktop compile-check path
- [x] Re-verify a local desktop launch after the missing-repo startup guard landed
- [x] Add an automated desktop smoke path or an explicit, repeatable local verification gate that is treated as release-critical
- [x] Decide whether desktop remains excluded from CI by design or gains a dedicated CI lane
- [x] Document the current packaging expectation around an operator-run unsigned macOS `.app` bundle via `./scripts/desktop-package.sh`
- [ ] Record a successful local bundle-build verification pass for the documented packaging helper on a real macOS release host

Exit criteria:
- [ ] Desktop confidence no longer depends mostly on compile plus startup inference; the documented package path has also been exercised and recorded

Risks:
- **risk:** bundle-build confidence depends on a future recorded package verification pass that may surface unexpected Tauri packaging issues
- **risk:** unsigned bundles may hit macOS Gatekeeper friction for end users

---

### Phase 8 — Data lifecycle and operator controls
**Status: not started**

Goals:
- [ ] Decide whether repo-specific pattern changes need a retroactive cleanup/reimport workflow before v1
- [ ] Add a safe maintenance flow for stale repositories, removed targets, and obsolete repo-scoped rollups if the product wants that behavior in-app
- [ ] Decide whether explicit history purge stays out of scope or becomes a supported operator action
- [ ] If cleanup flows are added, document rebuild consequences and add regression coverage where appropriate

Exit criteria:
- [ ] Operators can intentionally clean up or re-scope historical data without falling back to ad hoc DB edits

Risks:
- **risk:** deferred cleanup scope may surprise users who expect pattern changes to be fully retroactive
- **risk:** adding deletion flows introduces data loss risk that needs careful UX and confirmation gates

---

### Phase 9 — v1 stabilization and release readiness
**Status: not started**

Goals:
- [ ] Align public docs, workspace metadata, and release posture with the actual shipping story
- [ ] Reconfirm privacy and optional-remote-verification claims against the implementation
- [ ] Freeze the minimum supported operator workflow and its known caveats
- [ ] Re-run and record the final quality gates that genuinely passed
- [ ] Produce a release checklist that matches the real supported surfaces

Exit criteria:
- [ ] The repository tells a coherent, truthful, shippable story to both users and contributors

---

### Phase 10 — REST API and programmatic access
**Status: not started**

Goals:
- [ ] Design and document a versioned REST API surface (`/api/v1/`) exposing read access to repositories, snapshots, rollups, sessions, streaks, and achievements
- [ ] Add JSON response serialization for all analytics data currently rendered server-side
- [ ] Add API key authentication for local access (no cloud auth — just a bearer token in config)
- [ ] Add OpenAPI/Swagger spec generation or a hand-maintained spec file
- [ ] Add rate limiting and request logging
- [ ] Add a `/api/v1/health` endpoint for monitoring and integration testing
- [ ] Add write endpoints for repo management (add, remove, update patterns) gated behind auth
- [ ] Add webhook support for external consumers to subscribe to events (commits, pushes, session boundaries)
- [ ] Ensure the API surface is usable from scripts, CI pipelines, and external dashboards

Exit criteria:
- [ ] GitPulse data is programmatically accessible without scraping the HTML dashboard
- [ ] The API is documented, versioned, and authenticated

---

### Phase 11 — Plugin and extension system
**Status: not started**

Goals:
- [ ] Design a plugin architecture that allows extending GitPulse without forking (see `docs/plugin-architecture.md`)
- [ ] Define plugin lifecycle: discovery, loading, initialization, teardown
- [ ] Define plugin capabilities: custom metrics, custom achievements, custom dashboard widgets, custom data sources
- [ ] Implement a plugin manifest format (TOML-based, declaring capabilities and dependencies)
- [ ] Implement plugin isolation (separate process or WASM sandbox to prevent plugins from corrupting core state)
- [ ] Ship at least two first-party plugins as proof-of-concept: a custom achievement pack and a data export plugin
- [ ] Add plugin management to the CLI (`gitpulse plugin install/list/remove`)
- [ ] Add plugin configuration to `gitpulse.toml`
- [ ] Document the plugin development story for third-party authors

Exit criteria:
- [ ] A third-party developer can write, package, and distribute a GitPulse plugin without modifying core
- [ ] The plugin boundary is clean enough that core upgrades don't break well-behaved plugins

---

### Phase 12 — Advanced analytics and insights
**Status: not started**

Goals:
- [ ] Add time-of-day and day-of-week activity heatmaps with configurable time bucketing
- [ ] Add per-repository trend analysis: velocity changes, consistency scores, burnout indicators
- [ ] Add cross-repository correlation: which repos are worked on together, context-switching frequency
- [ ] Add code complexity tracking integration (optional — uses external tools like `tokei` extended metrics or language-specific analyzers)
- [ ] Add configurable "developer profile" — personal analytics summary with exportable snapshots
- [ ] Add weekly/monthly digest generation (Markdown or HTML report output)
- [ ] Add goal tracking history and trend visualization
- [ ] Keep all analytics derivable from stored events — no black-box ML, no opaque scoring

Exit criteria:
- [ ] GitPulse provides genuinely useful insights beyond raw counters
- [ ] Analytics remain interpretable and rebuildable from event data

---

### Phase 13 — Cross-platform desktop releases
**Status: not started**

Goals:
- [ ] Add Windows desktop build path (Tauri supports Windows natively)
- [ ] Add Linux desktop build path (AppImage or .deb)
- [ ] Set up CI-produced desktop artifacts for all three platforms
- [ ] Implement macOS code signing and notarization in CI
- [ ] Implement Windows code signing in CI
- [ ] Add auto-update support via Tauri's built-in updater
- [ ] Add updater key management and signing workflow
- [ ] Document the release workflow for all platforms
- [ ] Add platform-specific smoke tests in CI

Exit criteria:
- [ ] Users on macOS, Windows, and Linux can download a signed, auto-updating desktop app
- [ ] The release pipeline is reproducible and CI-driven

---

### Phase 14 — Notifications and alerting
**Status: not started**

Goals:
- [ ] Add configurable notifications for streak milestones, goal completion, and achievement unlocks
- [ ] Add native desktop notifications via Tauri notification API
- [ ] Add optional daily/weekly summary notifications
- [ ] Add inactivity alerts (configurable — "you haven't committed in X hours")
- [ ] Add webhook-based notifications for external consumers (Slack, Discord, etc.)
- [ ] Keep notifications opt-in and non-intrusive by default
- [ ] Add notification preferences to settings UI

Exit criteria:
- [ ] GitPulse can proactively surface relevant information without requiring the user to check the dashboard
- [ ] Notifications are useful, not annoying. Defaults are conservative

---

### Phase 15 — Multi-device sync (optional, encrypted)
**Status: not started**

Goals:
- [ ] Design a sync protocol that preserves local-first principles (CRDTs or operation-based sync)
- [ ] Implement encrypted local export/import for manual device transfer
- [ ] Add optional sync server support (self-hostable, no vendor lock-in)
- [ ] Ensure sync is end-to-end encrypted — the sync server never sees plaintext analytics data
- [ ] Add conflict resolution for overlapping sessions and rollups from different devices
- [ ] Add sync status UI in settings
- [ ] Keep GitPulse fully functional without sync enabled — sync is additive, not required
- [ ] Document the self-hosted sync server setup

Exit criteria:
- [ ] A developer working across multiple machines sees a unified analytics picture
- [ ] Sync is optional, encrypted, and self-hostable. No cloud vendor dependency

---

### Phase 16 — IDE integrations
**Status: not started**

Goals:
- [ ] Build a VS Code extension that shows GitPulse status in the status bar (current streak, session time, today's score)
- [ ] Add VS Code sidebar panel with mini-dashboard (today's stats, active session, recent achievements)
- [ ] Build a JetBrains plugin with equivalent status bar and tool window functionality
- [ ] Have IDE integrations communicate with the running GitPulse instance via the REST API (Phase 10)
- [ ] Add "focus mode" integration — IDE can signal session start/end to GitPulse
- [ ] Keep IDE integrations lightweight — they read from GitPulse, they don't duplicate the runtime
- [ ] Publish extensions to VS Code Marketplace and JetBrains Marketplace

Exit criteria:
- [ ] Developers see their GitPulse data where they already work without switching to a browser
- [ ] IDE integrations are thin API clients, not separate analytics engines

---

### Phase 17 — External service integrations
**Status: not started**

Goals:
- [ ] Add GitLab push verification support (parallel to existing GitHub verification)
- [ ] Add Gitea/Forgejo push verification support
- [ ] Add Bitbucket push verification support
- [ ] Add optional Jira/Linear/GitHub Issues integration for correlating commits with tickets
- [ ] Add calendar integration for correlating focus sessions with meeting schedules
- [ ] Design integration as a plugin capability so new services can be added without modifying core
- [ ] Keep all integrations opt-in and clearly documented about what data is sent

Exit criteria:
- [ ] GitPulse works with the forges and tools developers actually use, not just GitHub
- [ ] Integration scope and data sharing are transparent and configurable

---

### Phase 18 — Team and organization analytics (opt-in)
**Status: not started**

Goals:
- [ ] Design team analytics as an additive layer on top of personal analytics — never mandatory
- [ ] Add team creation and membership management
- [ ] Add aggregated team dashboards (anonymous by default — show team totals, not individual rankings)
- [ ] Add configurable privacy controls — each developer chooses what to share with their team
- [ ] Add team goal setting and progress tracking
- [ ] Ensure team features work in self-hosted environments, not just cloud
- [ ] Explicitly avoid gamification that creates unhealthy competition (no individual leaderboards by default)
- [ ] Document the privacy model and data sharing boundaries

Exit criteria:
- [ ] Teams can see aggregate activity without surveillance. Individual privacy is the default
- [ ] Team features are opt-in at every level: the individual, the team, and the organization

---

### Phase 19 — Mobile companion
**Status: not started**

Goals:
- [ ] Build a mobile companion app for viewing analytics on the go (read-only initially)
- [ ] Use the REST API (Phase 10) or sync protocol (Phase 15) for data access
- [ ] Support iOS and Android (evaluate: native, React Native, or Tauri mobile)
- [ ] Show daily summary, current streak, recent achievements, and session history
- [ ] Add push notifications for streak maintenance and achievement unlocks
- [ ] Keep the mobile app lightweight and focused — it's a viewer, not a full dashboard

Exit criteria:
- [ ] Developers can check their stats from their phone
- [ ] The mobile app does not require the desktop/CLI to be running if sync is enabled

---

## Open decisions and unresolved scope

### v1 scope

- Should `rebuild_analytics()` remain a full-history synchronous operation for v1, or is an incremental/scoped strategy necessary before real-world datasets get larger?
- Do repo-specific include/exclude overrides need a first-class retroactive cleanup/reimport flow before v1, or is forward-only behavior acceptable if documented clearly?
- Is explicit history purge intentionally out of scope for the first release, or does the product need a supported data-deletion/admin surface?
- Should bundle builds remain operator-local until signing/notarization are real scope, or does the project want a CI-produced unsigned artifact before then?

### v2 scope

- What is the right plugin isolation model? Separate processes (simpler, safer) vs WASM (more portable, sandboxed) vs dynamic linking (fastest, least safe)?
- Should the REST API use an existing framework convention (JSON:API, OpenAPI-first) or stay minimal and custom?
- When does the project need a proper website and docs site beyond the GitHub README?
- Should advanced analytics (Phase 12) be built into core or designed as first-party plugins to prove the plugin system?

### v3 scope

- What sync protocol fits the local-first constraint? CRDTs, event sourcing with merge, or something simpler?
- Should the sync server be a separate open-source project or live in this repo?
- Is the mobile companion worth building natively, or is a PWA sufficient?
- How do team analytics avoid becoming surveillance? What privacy defaults are non-negotiable?

---

## Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Full-history synchronous rebuilds slow down as datasets grow | Users feel lag on import and rescan | Phase 6 addresses this — decide before v1 release |
| Bundle-build confidence depends on an unrecorded verification pass | Packaging surprises at release time | Run and record one real macOS bundle build |
| Pattern override changes surprise users (forward-only behavior) | Stale historical data contradicts current patterns | Document clearly, consider retroactive cleanup in Phase 8 |
| Push detection based on ahead/behind transitions, not guaranteed truth | Remote state may disagree with local inference | GitHub verification is supplemental; document the approximation |
| Line counts distorted by refactors, formatting churn, generated files | Misleading analytics for some repos | UI labels metrics as approximate; exclusion patterns help |

---

## Decision log

- 2026-03-20: GitPulse is local-first and offline-first by default — keeps the product useful without external services and avoids source-upload pressure — optional GitHub verification stays supplemental rather than foundational.
- 2026-03-20: Live work, committed work, and pushed work remain separate product concepts — this keeps the metrics interpretable instead of collapsing unlike activity into one number — docs and UI should preserve that separation.
- 2026-03-20: Git CLI remains the repository truth boundary instead of switching to libgit2 — it keeps behavior closer to normal developer workflows and reduces v1 integration complexity — parsing and command coverage must stay well-tested.
- 2026-03-20: The product uses one shared runtime for CLI, web, and desktop surfaces — this avoids forking business logic across shells — `gitpulse-desktop` should stay thin.
- 2026-03-20: Global and repo-specific include/exclude patterns are merged with excludes winning — this keeps noisy paths reliably suppressible — repo-specific overrides do not retroactively rewrite old file-activity history.
- 2026-03-20: Imported commit history must be idempotent with respect to history-derived file activity — repeated imports should not inflate analytics — regression coverage now exists for that rule.
- 2026-03-20: Daily rollups must carry staged snapshot totals from the latest repo state — dashboard staged metrics should match real repository state — regression coverage now exists for that rule.
- 2026-03-21: Missing or no-longer-directory repo roots disable monitoring instead of aborting desktop/runtime startup — this keeps one stale local path from breaking the app shell — background and bulk flows should skip inactive repos.
- 2026-03-22: Daily live rollups derive from the latest observed snapshot per repo-day instead of summing file-activity events — this preserves the ledger split between live work and imported/committed work and prevents repeated refresh inflation — live, committed, and pushed totals stay interpretable.
- 2026-03-22: Current-day summaries and current streaks are anchored to the current local rollup day — this avoids showing stale historical days as `today` — older streaks still count toward best streak only.
- 2026-03-22: Repo-controlled chart labels must be escaped before entering trusted SVG output, and stored GitHub tokens should not be reflected back into rendered settings HTML — this removes an avoidable local rendering footgun and secret disclosure path — blank token submissions now preserve the stored token.
- 2026-03-22: Optional GitHub remote verification fails open on unsupported remote formats — unsupported remotes should not break local push detection or refresh flows — only actual GitHub API failures still surface as errors.
- 2026-03-22: Desktop release confidence now uses a repeatable local smoke gate plus a dedicated macOS compile lane — startup verification should be scriptable and CI should at least compile the shell on a native host — packaged bundle validation remains a separate later concern.
- 2026-03-22: The currently supported desktop packaging artifact is an operator-built unsigned macOS `.app` bundle via `cargo tauri build --bundles app`, wrapped by `./scripts/desktop-package.sh` — this keeps release scope explicit without pretending signing, notarization, or CI bundle publishing already exist — release docs must stay aligned with that limited promise.

---

## Immediate next moves

### v1 critical path

1. Resolve the Phase 6 strategy question: keep `rebuild_analytics()` full-history and synchronous for v1 with explicit bounds, or start the incremental/scoped redesign before scale makes the app feel laggy.
2. Run and record one real macOS bundle-build verification pass for `./scripts/desktop-package.sh`, or explicitly decide that bundle builds remain documented-but-unverified until release time.
3. Decide whether Phase 8 cleanup/admin flows are real product scope for v1 or explicitly deferred so the repo stops carrying ambiguous expectations.
4. Reconfirm release-facing docs and UI language after the remaining rebuild-strategy and desktop packaging decisions land.
5. Cut v0.1.0 release once phases 6-9 are resolved.

### v2 preparation

6. Design the REST API surface (Phase 10) — this unblocks IDE integrations, mobile, and plugins.
7. Prototype the plugin isolation model (Phase 11) — validate the process-based JSON-RPC approach with a simple first-party plugin.
8. Set up cross-platform CI for desktop builds (Phase 13) — Windows and Linux Tauri builds.
9. Evaluate auto-update infrastructure (Tauri updater, signing key management).

---

## Progress log

- 2026-03-20: Reviewed the repository structure, documentation, and current product state, then recorded the main verified workspace commands plus the open correctness, safety, and confidence gaps. Verified with: `cargo check --workspace --exclude gitpulse-desktop`, `cargo test --workspace --exclude gitpulse-desktop`, `cargo nextest run --workspace --exclude gitpulse-desktop`, `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`. Next: fix the historical import duplication and staged-rollup correctness issues first.
- 2026-03-20: Fixed repeated-import history inflation by ensuring imported `file_activity_events` are only written for newly inserted commits, and fixed staged snapshot propagation into daily rollups. Added targeted runtime regression coverage for both. Verified with: `cargo test -p gitpulse-runtime --test runtime_integration`, `cargo test --workspace --exclude gitpulse-desktop`, `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`. Next: address remaining rendering-safety, rebuild-scale, and desktop-confidence gaps.
- 2026-03-21: Hardened missing-repo startup and refresh behavior so stale repo paths disable cleanly instead of aborting desktop bootstrap, and made periodic/background work skip repositories that are not actively monitored. Verified with: `cargo test -p gitpulse-runtime --test runtime_integration`, `cargo check -p gitpulse-runtime`, `cargo clippy -p gitpulse-runtime --tests -- -D warnings`, `cargo check -p gitpulse-desktop`, `cargo run -p gitpulse-cli -- doctor`, `cargo run -p gitpulse-desktop`. Next: tackle chart-label hardening, rebuild scalability, and a stronger desktop verification story.
- 2026-03-21: Rewrote `BUILD.md` into a phase-based execution manual aligned with the repository's current product state, source-of-truth files, verification history, and active risks. Verified with: documentation and repository-structure audit. Next: keep phase status, decision log, and verified command history current as the repo evolves.
- 2026-03-22: Fixed daily rollup trust issues by deriving live/staged totals from latest per-day snapshots instead of file-activity accumulation, keeping imported commit history out of live totals, anchoring today/current-streak views to the current local day, escaping repo-controlled SVG chart labels, hiding stored GitHub tokens from settings HTML, and making optional GitHub verification fail open on unsupported remote formats. Added targeted regressions across core/runtime/web/infra and refreshed metrics docs. Verified with: `cargo fmt --all`, `cargo test -p gitpulse-runtime --test runtime_integration`, `cargo test -p gitpulse-web`, `cargo test -p gitpulse-core`, `cargo test -p gitpulse-infra`, `cargo check --workspace --exclude gitpulse-desktop`. Next: decide the Phase 6 rebuild strategy and strengthen the desktop release verification path.
- 2026-03-22: Landed a repeatable desktop smoke gate by teaching `gitpulse-desktop` to self-verify startup under `GITPULSE_DESKTOP_SMOKE_TEST`, added `scripts/desktop-smoke.sh` as the release-critical local check, and added a dedicated `desktop-macos` CI compile lane. Verified with: `cargo fmt --all`, `cargo check -p gitpulse-desktop`, `./scripts/desktop-smoke.sh`. Next: document packaging/release-bundle expectations so Phase 7 can close cleanly.
- 2026-03-22: Documented the current desktop packaging scope around an operator-run unsigned macOS `.app` bundle, added `docs/desktop-release.md`, and added `./scripts/desktop-package.sh` as the release-host helper. Verified with: documentation and script audit. Next: record one real bundle-build verification pass or explicitly keep packaging as documented-but-unverified.

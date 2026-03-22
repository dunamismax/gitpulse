# GitPulse Build Plan

Last updated: 2026-03-22
Status: active product hardening and release-shaping
Scope: local-first Rust desktop and web app for repository activity analytics
Primary UI: localhost Axum + Askama + HTMX dashboard, with a thin Tauri desktop shell over the same runtime
Primary delivery order: analytics correctness and trust first, then desktop confidence and release workflow, then rebuild scale and data-lifecycle cleanup

## Purpose

This file is the canonical execution, tracking, and handoff document for GitPulse.
Any agent making meaningful changes to code, docs, tooling, data flow, or product behavior should read it first and update it before handoff.
If deeper design docs exist under `docs/`, link them here instead of replacing this file.
Claims about verification, product behavior, release posture, and open risks should stay explicit here rather than living in chat memory.

## Mission

- Deliver trustworthy personal repository analytics without uploading source code or diff contents.
- Keep live work, committed work, and pushed work separate throughout the product so the metrics stay interpretable.
- Reuse one Rust runtime across CLI, local web, and desktop surfaces instead of letting each shell fork behavior.
- Keep the persistence model inspectable and rebuildable: raw events, derived rollups, and gamified score should remain distinct.
- Make the repo easy for multiple contributors or agents to work in without blurring crate boundaries or documentation ownership.

## Current Repository Snapshot

### Active root

- `BUILD.md` is the canonical execution and status ledger.
- `README.md` is the user-facing overview and quick-start entrypoint.
- `AGENTS.md` is the concise repo-memory companion for future coding passes.
- `docs/architecture.md` explains crate boundaries and runtime shape.
- `docs/metrics.md` defines metric semantics and caveats.
- `docs/desktop-release.md` is the current desktop packaging and release-scope note.
- `.github/workflows/ci.yml` is the current CI source of truth.
- `migrations/0001_init.sql` is the active database schema baseline.
- `gitpulse.example.toml` is the config example surface.
- `scripts/desktop-smoke.sh` is the release-critical local desktop startup gate.
- `scripts/desktop-package.sh` is the current helper for macOS `.app` bundle builds.

### Active product surfaces

- `apps/gitpulse-cli`
  - Headless operator entrypoint for `serve`, `add`, `rescan`, `import`, `rebuild-rollups`, and `doctor`.
- `apps/gitpulse-desktop`
  - Thin Tauri v2 shell that launches the same runtime and local web UI.
- `crates/gitpulse-core`
  - Domain models, settings types, score formula, streak logic, sessionization, and timezone/day-boundary rules.
- `crates/gitpulse-infra`
  - Config loading, app directories, SQLite/SQLx persistence, git CLI integration, exclusions, watcher bridge, and optional GitHub verification.
- `crates/gitpulse-runtime`
  - Repo discovery, add/import/refresh orchestration, push detection, analytics rebuilds, and high-level queries.
- `crates/gitpulse-web`
  - Axum routes, Askama templates, HTMX partials, and SVG chart rendering.

### Current implemented state

Implemented:

- local web dashboard with Axum + Askama + HTMX
- thin Tauri v2 desktop shell over the same runtime/web stack
- parent-folder repo discovery and direct repo add flows
- recent-history commit import for tracked repositories
- working-tree and staged diff snapshots
- untracked text-file line counting
- local push detection from ahead/behind transitions
- optional GitHub-based remote push confirmation
- focus sessions, daily rollups, streaks, goals, score, and achievements
- per-repo include/exclude override editing from the repository detail page
- explicit `rebuild-rollups` CLI maintenance path
- CI wiring for format, clippy, nextest, cargo-deny, and a native macOS desktop compile lane
- repeatable desktop startup smoke path via `./scripts/desktop-smoke.sh`
- documented operator-run macOS `.app` packaging flow via `./scripts/desktop-package.sh` and `docs/desktop-release.md`

Not implemented:

- team or cloud mode
- mobile client
- explicit history-purge UI
- retroactive rewrite of older stored file-activity history when repo-specific patterns change
- CI-built or signed/notarized desktop release artifacts

### Current strengths

- The crate split is clean: `gitpulse-core` stays mostly pure, `gitpulse-infra` owns external boundaries, `gitpulse-runtime` orchestrates, and `gitpulse-web` stays presentation-focused.
- The docs are aligned around the same product model: `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/metrics.md`, `docs/desktop-release.md`, and this file describe the same local-first runtime.
- The local-first story is consistent: primary functionality does not require an external service, and GitHub verification is optional rather than foundational.
- Quality gates are real, not decorative: CI runs format, clippy, nextest, cargo-deny, and a native macOS desktop compile lane.

### Current open product gaps

- `rebuild_analytics()` is still full-history and synchronous on the hot path, which may become a scale problem on longer-lived datasets.
- Desktop startup and packaging expectations are now documented, but there is not yet a recorded local verification pass for the `.app` bundle helper and CI still does not build bundles.
- Pattern overrides affect future refresh/import behavior plus immediate rescans, but they do not retroactively rewrite older file-activity history.

### Observed operator snapshot

- Last reviewed directly in the repo on `2026-03-22`.
- Host used for the earlier recorded verification passes: macOS in `/Users/sawyer/github/gitpulse`.
- Current branch observed during this BUILD rewrite pass: `main`.
- Observed `origin` remote matches the owner’s dual-push convention:
  - fetch: `git@github.com-dunamismax:dunamismax/gitpulse.git`
  - push: `git@github.com-dunamismax:dunamismax/gitpulse.git`
  - push: `git@codeberg.org-dunamismax:dunamismax/gitpulse.git`
- Observed toolchain during the recorded verification history: `cargo 1.94.0`, `rustc 1.94.0`, `git 2.50.1`, `sqlite3 3.51.0`.

## Currently Verified Commands

These commands are recorded as having actually passed in this repository.
Do not silently add to this list unless the command was really run.

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

CI is also wired to run `cargo fmt --all -- --check`, `cargo deny check`, and a native `cargo check -p gitpulse-desktop` lane on `macos-latest`, but those are CI-configured gates, not part of the locally recorded command list above unless a future pass explicitly re-verifies them here.

## Product Principles

- Local-first first.
  GitPulse should remain useful with no cloud service, no diff upload, and no token configured.
- One product, multiple shells.
  CLI, local web, and desktop should share the same runtime and data model rather than drifting apart.
- Separate the ledgers.
  Live work, commit history, push history, derived rollups, and score should stay conceptually separate.
- Rebuildable analytics.
  Raw events should remain rich enough that sessions, rollups, and achievements can be recalculated intentionally.
- Thin surfaces.
  `gitpulse-web` and `gitpulse-desktop` should stay thin compared with `gitpulse-runtime`, `gitpulse-infra`, and `gitpulse-core`.
- Git truth comes from the git boundary.
  Canonical repo state should come from git snapshots and persisted events, not from raw watcher noise.
- Explicit caveats beat false precision.
  Approximate metrics are fine if the approximation is documented and the UI does not pretend otherwise.
- Repo-controlled strings are untrusted input.
  Paths, file names, branch names, and language labels should not be treated as safe just because the app is local-first.
- Docs and tests move with behavior.
  If metric semantics, runtime behavior, or operator workflows change, update docs and regression coverage in the same pass.

## Source Of Truth By Concern

- Project status, roadmap, verification history, and handoff rules:
  - `BUILD.md`
- User-facing product story and local run instructions:
  - `README.md`
- Concise repo memory for future contributors:
  - `AGENTS.md`
- Architecture boundaries and product flow:
  - `docs/architecture.md`
- Metric semantics, caveats, and interpretation:
  - `docs/metrics.md`
- Desktop packaging scope and operator workflow:
  - `docs/desktop-release.md`
  - `scripts/desktop-package.sh`
- Workspace members, dependency policy, lint policy, and release profile:
  - `Cargo.toml`
- Toolchain pinning and formatter/lint support files:
  - `rust-toolchain.toml`
  - `rustfmt.toml`
  - `clippy.toml`
  - `deny.toml`
- CI truth for routine automated validation:
  - `.github/workflows/ci.yml`
- Database schema and table inventory:
  - `migrations/0001_init.sql`
- Domain rules for score, streaks, sessions, timezone/day-boundary handling, and shared types:
  - `crates/gitpulse-core/src/*`
- Config loading, app directories, database access, git integration, exclusions, watcher behavior, and optional GitHub verification:
  - `crates/gitpulse-infra/src/config.rs`
  - `crates/gitpulse-infra/src/dirs.rs`
  - `crates/gitpulse-infra/src/db.rs`
  - `crates/gitpulse-infra/src/git.rs`
  - `crates/gitpulse-infra/src/watcher.rs`
- Application orchestration and analytics rebuild flow:
  - `crates/gitpulse-runtime/src/lib.rs`
- Web routes and server-side page composition:
  - `crates/gitpulse-web/src/lib.rs`
- HTML templates and partials:
  - `crates/gitpulse-web/templates/*`
- Shared UI assets:
  - `assets/css/app.css`
  - `assets/js/app.js`
  - `assets/js/htmx.min.js`
- CLI and desktop entrypoint behavior:
  - `apps/gitpulse-cli/src/main.rs`
  - `apps/gitpulse-desktop/src/main.rs`

## Target Architecture

### Crate boundaries

- `gitpulse-core`
  - Pure-ish domain rules and shared types.
  - Score, streak, session, and timezone/day-boundary logic.
  - Settings and analytics model types.
- `gitpulse-infra`
  - External boundaries.
  - SQLite/SQLx, migrations, config, app directories, git parsing, repo discovery, exclusions, watchers, and optional GitHub verification.
- `gitpulse-runtime`
  - Application orchestration.
  - Add target, discover repos, import history, refresh snapshots, detect pushes, rebuild analytics, and serve data to UI/CLI consumers.
- `gitpulse-web`
  - Axum routes, Askama templates, HTMX partials, and SVG chart rendering.
  - Should stay presentation-oriented and avoid owning product rules.
- `gitpulse-cli`
  - Headless operator and diagnostics entrypoint.
- `gitpulse-desktop`
  - Thin Tauri shell that hosts the same localhost UI and exposes native folder picking where available.

### Data flow

1. A repo root or parent folder is added through CLI or UI.
2. The runtime discovers tracked repositories and persists them.
3. Initial history import reads qualifying commit metadata through the git CLI.
4. A debounced watcher plus periodic polling enqueues refresh work.
5. Refreshes collect canonical repo state:
   - branch/head/upstream metadata
   - ahead/behind counts
   - working-tree and staged numstat diffs
   - untracked text additions
   - periodic language/size snapshots
6. The runtime writes snapshots and event records into SQLite.
7. Analytics rebuilds derive sessions, daily rollups, streaks, score, goals, and achievements.
8. Axum + Askama + HTMX pages read those derived views for dashboard and drill-down pages.
9. The desktop shell reuses the same runtime and routes instead of introducing a separate product implementation.

## How Agents Must Work

1. Read `BUILD.md` first for any substantial repo work.
2. Then read `AGENTS.md`, `README.md`, `docs/architecture.md`, and `docs/metrics.md` before changing behavior that touches product semantics.
3. If desktop packaging or release posture changes, also read and update `docs/desktop-release.md` in the same pass.
4. Keep product rules in `gitpulse-core`, integration boundaries in `gitpulse-infra`, orchestration in `gitpulse-runtime`, and presentation logic in `gitpulse-web` or app shells.
5. Treat `migrations/0001_init.sql` as the schema baseline; if the data model changes, migrate it deliberately and update docs in the same pass.
6. If metric semantics change, update `docs/metrics.md`, relevant tests, and this file together.
7. If git parsing, repo discovery, analytics rebuilds, or missing-repo handling change, prefer regression coverage in `crates/gitpulse-infra/tests/` or `crates/gitpulse-runtime/tests/`.
8. If routes, templates, or HTMX partial behavior change, keep route smoke tests and template paths aligned.
9. Do not mark work complete until the artifact exists and the commands that were actually run are recorded truthfully.
10. When behavior intentionally changes or scope is consciously deferred, record it in the decision log instead of leaving it implicit.
11. Treat repo-controlled labels and path-like values as untrusted input whenever they are rendered into HTML, SVG, or logs.

## Tracking Conventions

- Each phase has a `Status:` line.
  Use `not started`, `in progress`, `done`, or `blocked`.
- Checkboxes represent concrete deliverables.
  Only check a box when the work is really landed or explicitly documented as complete.
- The progress log is append-only.
  Do not rewrite old history into a cleaner story after the fact.
- If scope changes, update the relevant phase checklist before or alongside the code.
- If something is blocked by a missing decision, put it in `Open decisions and unresolved scope` rather than relying on handoff memory.

### Progress log format

- `YYYY-MM-DD: scope - outcome. Verified with: <commands>. Next: <follow-up>.`

### Decision log format

- `YYYY-MM-DD: decision - rationale - consequence.`

## Phase Dashboard

- Phase 0 - Product charter and source-of-truth capture. Status: done.
- Phase 1 - Workspace, schema, and infrastructure foundation. Status: done.
- Phase 2 - Runtime orchestration and analytics model. Status: done.
- Phase 3 - Web dashboard and shared product surfaces. Status: done.
- Phase 4 - Correctness hardening and regression coverage. Status: done.
- Phase 5 - Trust and output hardening. Status: done.
- Phase 6 - Performance and rebuild strategy. Status: not started.
- Phase 7 - Desktop confidence and release operations. Status: in progress.
- Phase 8 - Data lifecycle and operator controls. Status: not started.
- Phase 9 - v1 stabilization and release readiness. Status: not started.

## Parallel Work Lanes

- Lane A - docs, metrics semantics, and handoff accuracy.
  - Expected write surface: `BUILD.md`, `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/metrics.md`, `docs/desktop-release.md`.
- Lane B - core product rules.
  - Expected write surface: `crates/gitpulse-core/`.
- Lane C - infra and persistence.
  - Expected write surface: `crates/gitpulse-infra/`, `migrations/`.
- Lane D - runtime orchestration and analytics rebuild logic.
  - Expected write surface: `crates/gitpulse-runtime/`.
- Lane E - web routes, templates, and assets.
  - Expected write surface: `crates/gitpulse-web/`, `assets/`.
- Lane F - desktop shell, CLI entrypoints, and CI/release plumbing.
  - Expected write surface: `apps/`, `scripts/`, `.github/workflows/`, workspace policy files.

### Coordination rules

- Keep file ownership disjoint when multiple contributors work in parallel.
- If a change crosses crate boundaries, update the architecture notes or phase notes in this file in the same change set.
- Prefer adding the regression test in the same lane that introduces the behavior change.
- Avoid duplicating metric semantics across multiple docs; document them once in `docs/metrics.md` and link back here when needed.

## Quality Gates

### Current recorded local gate

- `cargo check --workspace --exclude gitpulse-desktop`
- `cargo test --workspace --exclude gitpulse-desktop`
- `cargo nextest run --workspace --exclude gitpulse-desktop`
- `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`
- `cargo test -p gitpulse-runtime --test runtime_integration`
- `cargo clippy -p gitpulse-runtime --tests -- -D warnings`
- `cargo check -p gitpulse-desktop`
- `./scripts/desktop-smoke.sh`
- `cargo run -p gitpulse-cli -- rebuild-rollups`
- `cargo run -p gitpulse-cli -- doctor`

### CI-configured gate

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`
- `cargo nextest run --workspace --exclude gitpulse-desktop`
- `cargo deny check`
- `cargo check -p gitpulse-desktop` on `macos-latest`

If a future command is expected but has not been run in a local verification pass, do not present it as locally verified; record it as CI-only or planned.

## Detailed Phase Plan

### Phase 0 - Product charter and source-of-truth capture

Status: done

- [x] Establish `BUILD.md` as the canonical handoff document.
- [x] Establish `README.md` as the user-facing overview and quick-start doc.
- [x] Establish `AGENTS.md` as concise repo memory for future contributors.
- [x] Capture architecture and metric semantics in dedicated docs under `docs/`.
- [x] Make the local-first, no-source-upload product stance explicit.
- [x] Document that live work, committed work, and pushed work are separate product concepts.

Exit criteria:

- [x] Contributors can tell what GitPulse is, how it is structured, and where truth lives without reverse-engineering the repo.

### Phase 1 - Workspace, schema, and infrastructure foundation

Status: done

- [x] Land the Rust workspace with the current app and crate split.
- [x] Add the SQLite schema baseline under `migrations/0001_init.sql`.
- [x] Wire config loading, app directories, and persistence bootstrapping.
- [x] Implement git CLI integration for discovery, status snapshots, and history import.
- [x] Implement watcher support and repo refresh enqueueing.
- [x] Provide the CLI surface for operating the app locally.

Exit criteria:

- [x] A fresh clone has an understandable Rust-first entrypoint and a persistent local data model.

### Phase 2 - Runtime orchestration and analytics model

Status: done

- [x] Add tracked-target and repository discovery flows.
- [x] Add recent-history import for tracked repos.
- [x] Add live working-tree and staged snapshotting.
- [x] Add ahead/behind-based local push detection plus optional GitHub verification.
- [x] Persist snapshots, file activity, commits, pushes, settings, sessions, rollups, and achievements.
- [x] Rebuild analytics from ledger data into sessions, streaks, score, goals, and achievements.
- [x] Keep timezone/day-boundary behavior explicit and configurable.

Exit criteria:

- [x] GitPulse can build a meaningful local analytics picture from tracked repositories and stored event data.

### Phase 3 - Web dashboard and shared product surfaces

Status: done

- [x] Land the Axum + Askama + HTMX local web dashboard.
- [x] Land dashboard, repositories, repo detail, sessions, achievements, and settings pages.
- [x] Add server-side SVG chart rendering.
- [x] Add repository detail editing for repo-specific include/exclude overrides.
- [x] Keep the Tauri desktop shell thin and pointed at the same runtime/web surface.

Exit criteria:

- [x] The app has a usable local UI and a desktop shell without splitting the product into multiple implementations.

### Phase 4 - Correctness hardening and regression coverage

Status: done

- [x] Fix repeated history imports so historical file-activity rows are not duplicated on re-import.
- [x] Fix staged snapshot propagation into daily rollups so dashboard staged totals reflect reality.
- [x] Add regression coverage for both import idempotency and staged-rollup behavior.
- [x] Harden missing-repo startup handling so missing watched repos disable cleanly instead of aborting bootstrap.
- [x] Make periodic/background enqueue and bulk rescan flows skip repositories that are not actively monitored.
- [x] Add regression coverage for missing-repo bootstrap and refresh-after-disappearance behavior.

Exit criteria:

- [x] The known high-priority correctness issues from the 2026-03-20 review are fixed and covered by regression tests.

### Phase 5 - Trust and output hardening

Status: done

- [x] Escape or structurally render repo-detail SVG labels instead of injecting raw text into trusted SVG output.
- [x] Add regression coverage for chart-label escaping or equivalent safe rendering behavior.
- [x] Audit remaining repo-controlled strings rendered through templates, SVG helpers, or other trusted sinks.
- [x] Re-check docs wording so the app’s local-first trust story matches the implementation after the rendering hardening lands.

Exit criteria:

- [x] Repo-controlled text is no longer treated as implicitly safe in rendered chart output.
- [x] There is at least one targeted regression test covering the resolved rendering path.

### Phase 6 - Performance and rebuild strategy

Status: not started

- [ ] Decide whether full-history synchronous `rebuild_analytics()` remains acceptable for v1 datasets.
- [ ] If not, design and implement an incremental or scoped rebuild strategy without losing auditability.
- [ ] Add measurement or benchmark coverage for analytics rebuild cost on larger histories.
- [ ] Document the operator story for expensive rebuilds, long import histories, and many-repo datasets.
- [ ] Keep raw-event versus derived-rollup boundaries explicit even if rebuild implementation changes.

Exit criteria:

- [ ] The scalability story is explicit rather than assumed.
- [ ] The repo has a believable answer for long-lived datasets beyond small demo usage.

### Phase 7 - Desktop confidence and release operations

Status: in progress

- [x] Keep `gitpulse-desktop` as a thin shell over the shared runtime and local web UI.
- [x] Maintain at least a desktop compile-check path.
- [x] Re-verify a local desktop launch after the missing-repo startup guard landed.
- [x] Add an automated desktop smoke path or an explicit, repeatable local verification gate that is treated as release-critical.
- [x] Decide whether desktop remains excluded from CI by design or gains a dedicated CI lane.
- [x] Document the current packaging expectation around an operator-run unsigned macOS `.app` bundle via `./scripts/desktop-package.sh`.
- [ ] Record a successful local bundle-build verification pass for the documented packaging helper on a real macOS release host.

Exit criteria:

- [ ] Desktop confidence no longer depends mostly on compile plus startup inference; the documented package path has also been exercised and recorded.

### Phase 8 - Data lifecycle and operator controls

Status: not started

- [ ] Decide whether repo-specific pattern changes need a retroactive cleanup/reimport workflow before v1.
- [ ] Add a safe maintenance flow for stale repositories, removed targets, and obsolete repo-scoped rollups if the product wants that behavior in-app.
- [ ] Decide whether explicit history purge stays out of scope or becomes a supported operator action.
- [ ] If cleanup flows are added, document rebuild consequences and add regression coverage where appropriate.

Exit criteria:

- [ ] Operators can intentionally clean up or re-scope historical data without falling back to ad hoc DB edits.

### Phase 9 - v1 stabilization and release readiness

Status: not started

- [ ] Align public docs, workspace metadata, and release posture with the actual shipping story.
- [ ] Reconfirm privacy and optional-remote-verification claims against the implementation.
- [ ] Freeze the minimum supported operator workflow and its known caveats.
- [ ] Re-run and record the final quality gates that genuinely passed.
- [ ] Produce a release checklist that matches the real supported surfaces.

Exit criteria:

- [ ] The repository tells a coherent, truthful, shippable story to both users and contributors.

## Open Decisions And Unresolved Scope

- Should `rebuild_analytics()` remain a full-history synchronous operation for v1, or is an incremental/scoped strategy necessary before real-world datasets get larger?
- Do repo-specific include/exclude overrides need a first-class retroactive cleanup/reimport flow before v1, or is forward-only behavior acceptable if documented clearly?
- Is explicit history purge intentionally out of scope for the first release, or does the product need a supported data-deletion/admin surface?
- Should bundle builds remain operator-local until signing/notarization are real scope, or does the project want a CI-produced unsigned artifact before then?

## Risk Register

- Full-history synchronous rebuilds may become noticeably slow as tracked repo count and commit history grow.
- Desktop startup confidence is now stronger thanks to the repeatable smoke gate and macOS compile lane, and packaging expectations are documented, but bundle-build confidence still depends on a future recorded package verification pass.
- Pattern override changes can surprise users because future behavior updates immediately but previously stored file-activity history remains as historical truth.
- Push detection is based on observed upstream state transitions first and optional GitHub confirmation second, so remote truth is not guaranteed in every environment.
- Line counts remain approximate operational telemetry and can still be distorted by large refactors, formatting churn, generated files, or deletions.

## Decision Log

- 2026-03-20: GitPulse is local-first and offline-first by default - keeps the product useful without external services and avoids source-upload pressure - optional GitHub verification stays supplemental rather than foundational.
- 2026-03-20: Live work, committed work, and pushed work remain separate product concepts - this keeps the metrics interpretable instead of collapsing unlike activity into one number - docs and UI should preserve that separation.
- 2026-03-20: Git CLI remains the repository truth boundary instead of switching to libgit2 - it keeps behavior closer to normal developer workflows and reduces v1 integration complexity - parsing and command coverage must stay well-tested.
- 2026-03-20: The product uses one shared runtime for CLI, web, and desktop surfaces - this avoids forking business logic across shells - `gitpulse-desktop` should stay thin.
- 2026-03-20: Global and repo-specific include/exclude patterns are merged with excludes winning - this keeps noisy paths reliably suppressible - repo-specific overrides do not retroactively rewrite old file-activity history.
- 2026-03-20: Imported commit history must be idempotent with respect to history-derived file activity - repeated imports should not inflate analytics - regression coverage now exists for that rule.
- 2026-03-20: Daily rollups must carry staged snapshot totals from the latest repo state - dashboard staged metrics should match real repository state - regression coverage now exists for that rule.
- 2026-03-21: Missing or no-longer-directory repo roots disable monitoring instead of aborting desktop/runtime startup - this keeps one stale local path from breaking the app shell - background and bulk flows should skip inactive repos.
- 2026-03-22: Daily live rollups derive from the latest observed snapshot per repo-day instead of summing file-activity events - this preserves the ledger split between live work and imported/committed work and prevents repeated refresh inflation - live, committed, and pushed totals stay interpretable.
- 2026-03-22: Current-day summaries and current streaks are anchored to the current local rollup day - this avoids showing stale historical days as `today` - older streaks still count toward best streak only.
- 2026-03-22: Repo-controlled chart labels must be escaped before entering trusted SVG output, and stored GitHub tokens should not be reflected back into rendered settings HTML - this removes an avoidable local rendering footgun and secret disclosure path - blank token submissions now preserve the stored token.
- 2026-03-22: Optional GitHub remote verification fails open on unsupported remote formats - unsupported remotes should not break local push detection or refresh flows - only actual GitHub API failures still surface as errors.
- 2026-03-22: Desktop release confidence now uses a repeatable local smoke gate plus a dedicated macOS compile lane - startup verification should be scriptable and CI should at least compile the shell on a native host - packaged bundle validation remains a separate later concern.
- 2026-03-22: The currently supported desktop packaging artifact is an operator-built unsigned macOS `.app` bundle via `cargo tauri build --bundles app`, wrapped by `./scripts/desktop-package.sh` - this keeps release scope explicit without pretending signing, notarization, or CI bundle publishing already exist - release docs must stay aligned with that limited promise.

## Immediate Next Moves

1. Resolve the Phase 6 strategy question: keep `rebuild_analytics()` full-history and synchronous for v1 with explicit bounds, or start the incremental/scoped redesign before scale makes the app feel laggy.
2. Run and record one real macOS bundle-build verification pass for `./scripts/desktop-package.sh`, or explicitly decide that bundle builds remain documented-but-unverified until release time.
3. Decide whether Phase 8 cleanup/admin flows are real product scope for v1 or explicitly deferred so the repo stops carrying ambiguous expectations.
4. Reconfirm release-facing docs and UI language after the remaining rebuild-strategy and desktop packaging decisions land.

## Progress Log

- 2026-03-20: Reviewed the repository structure, documentation, and current product state, then recorded the main verified workspace commands plus the open correctness, safety, and confidence gaps. Verified with: `cargo check --workspace --exclude gitpulse-desktop`, `cargo test --workspace --exclude gitpulse-desktop`, `cargo nextest run --workspace --exclude gitpulse-desktop`, `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`. Next: fix the historical import duplication and staged-rollup correctness issues first.
- 2026-03-20: Fixed repeated-import history inflation by ensuring imported `file_activity_events` are only written for newly inserted commits, and fixed staged snapshot propagation into daily rollups. Added targeted runtime regression coverage for both. Verified with: `cargo test -p gitpulse-runtime --test runtime_integration`, `cargo test --workspace --exclude gitpulse-desktop`, `cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings`. Next: address remaining rendering-safety, rebuild-scale, and desktop-confidence gaps.
- 2026-03-21: Hardened missing-repo startup and refresh behavior so stale repo paths disable cleanly instead of aborting desktop bootstrap, and made periodic/background work skip repositories that are not actively monitored. Verified with: `cargo test -p gitpulse-runtime --test runtime_integration`, `cargo check -p gitpulse-runtime`, `cargo clippy -p gitpulse-runtime --tests -- -D warnings`, `cargo check -p gitpulse-desktop`, `cargo run -p gitpulse-cli -- doctor`, `cargo run -p gitpulse-desktop`. Next: tackle chart-label hardening, rebuild scalability, and a stronger desktop verification story.
- 2026-03-21: Rewrote `BUILD.md` into a phase-based execution manual aligned with the repository’s current product state, source-of-truth files, verification history, and active risks. Verified with: documentation and repository-structure audit. Next: keep phase status, decision log, and verified command history current as the repo evolves.
- 2026-03-22: Fixed daily rollup trust issues by deriving live/staged totals from latest per-day snapshots instead of file-activity accumulation, keeping imported commit history out of live totals, anchoring today/current-streak views to the current local day, escaping repo-controlled SVG chart labels, hiding stored GitHub tokens from settings HTML, and making optional GitHub verification fail open on unsupported remote formats. Added targeted regressions across core/runtime/web/infra and refreshed metrics docs. Verified with: `cargo fmt --all`, `cargo test -p gitpulse-runtime --test runtime_integration`, `cargo test -p gitpulse-web`, `cargo test -p gitpulse-core`, `cargo test -p gitpulse-infra`, `cargo check --workspace --exclude gitpulse-desktop`. Next: decide the Phase 6 rebuild strategy and strengthen the desktop release verification path.
- 2026-03-22: Landed a repeatable desktop smoke gate by teaching `gitpulse-desktop` to self-verify startup under `GITPULSE_DESKTOP_SMOKE_TEST`, added `scripts/desktop-smoke.sh` as the release-critical local check, and added a dedicated `desktop-macos` CI compile lane. Verified with: `cargo fmt --all`, `cargo check -p gitpulse-desktop`, `./scripts/desktop-smoke.sh`. Next: document packaging/release-bundle expectations so Phase 7 can close cleanly.
- 2026-03-22: Documented the current desktop packaging scope around an operator-run unsigned macOS `.app` bundle, added `docs/desktop-release.md`, and added `./scripts/desktop-package.sh` as the release-host helper. Verified with: documentation and script audit. Next: record one real bundle-build verification pass or explicitly keep packaging as documented-but-unverified.

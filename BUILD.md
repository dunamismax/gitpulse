# BUILD.md

## Agent operating rules

Future agents working in `gitpulse` must follow these rules before touching code or docs:

- Read this file first.
- Treat this file as the active rewrite execution manual while the build is in flight.
- Keep this file current whenever scope, sequencing, or repo truth changes.
- Only check a box after the work is actually completed and verified in the repo.
- Do not mark a box done for partial progress, intent, or unverified claims.
- If code and docs disagree about shipped behavior, code wins.
- If this file and older planning language disagree about the build target, this file wins.

## Product description

**GitPulse** is a native macOS application for local-first git activity analytics. It tracks commit history, working tree changes, and push activity as separate ledgers, giving developers honest signals about their coding patterns without uploading source code anywhere.

GitPulse runs as a menu bar app with a full SwiftUI dashboard window, scanning local git repositories and building analytics locally. A companion CLI mode provides the same operator actions from the terminal. The app watches configured directories for changes and refreshes analytics automatically.

Core product concepts carried forward from the proven Go prototype:

- **Separate ledgers**: live work (uncommitted changes), committed work (commit history), and pushed work (remote sync) are tracked independently
- **Rebuildable analytics**: focus sessions, daily rollups, streaks, scores, and achievements are derived from stored events and can be recomputed at any time
- **Manual-first with optional automation**: explicit add, import, rescan, and rebuild actions remain available; FSEvents-based file watching layers on top as opt-in convenience
- **No cloud dependency for core use**: all scanning, storage, and analysis happen on the local machine
- **CloudKit is additive only**: optional cross-device sync for stats, never required for core functionality

## Current repo truth

- [ ] Swift Package Manager project compiles and runs
- [ ] Git CLI integration scans repositories and imports history
- [ ] SwiftData schema stores all domain entities
- [ ] Dashboard window renders real analytics data
- [ ] Swift Charts visualizations display commit activity and language breakdowns
- [ ] Menu bar item shows quick stats and provides app access
- [ ] CLI mode supports add, import, rescan, rebuild, and doctor commands
- [ ] FSEvents watches configured directories for changes
- [ ] Contribution graph renders with accurate daily data
- [ ] Settings persist and restore across launches
- [ ] App is notarized and distributable outside the App Store
- [ ] Homebrew formula published

## Product guardrails

These are not build goals unless Stephen changes direction:

- Turning GitPulse into a cloud-first or source-upload service
- Adding a backend server or web dashboard; this is a native app
- Supporting Linux or Windows; macOS-first, iOS companion later
- Replacing explicit SQL-equivalent queries with opaque Core Data fetch patterns
- Adding social features, team dashboards, or multi-user analytics
- Background network activity beyond optional CloudKit sync
- Tracking repositories the user has not explicitly added or approved
- Shipping an iOS app before the macOS app is complete and stable

## Stack

| Layer | Technology |
|---|---|
| UI framework | SwiftUI (macOS 14+ / iOS 17+) |
| Charts | Swift Charts |
| Data persistence | SwiftData |
| Git integration | git CLI via Process (with libgit2 Swift bindings as future option) |
| CLI mode | Swift Argument Parser |
| File watching | FSEvents via DispatchSource / FileManager |
| Networking | CloudKit (optional sync only) |
| Package manager | Swift Package Manager |
| Distribution | Homebrew formula + direct .dmg download + Mac App Store (stretch) |
| CI | GitHub Actions (xcodebuild + swift test) |
| Minimum deployment | macOS 14 Sonoma |

## Phase status summary

- [ ] Phase 1 -- Bootstrap Swift package and app target
- [ ] Phase 2 -- Git scanning engine
- [ ] Phase 3 -- Data model and SwiftData storage
- [ ] Phase 4 -- Dashboard UI shell
- [ ] Phase 5 -- Charts and visualizations
- [ ] Phase 6 -- Menu bar app
- [ ] Phase 7 -- CLI mode
- [ ] Phase 8 -- File watching and auto-refresh
- [ ] Phase 9 -- Polish and accessibility
- [ ] Phase 10 -- Distribution

---

## Phase 1 -- Bootstrap Swift package and app target

### Objectives

Stand up the Swift Package Manager project structure, create the macOS app target and CLI target, confirm the build compiles, and establish CI.

### Checklist

- [ ] Initialize Swift package with `Package.swift` at repo root
- [ ] Create macOS app target (`GitPulse`) with SwiftUI lifecycle
- [ ] Create CLI target (`gitpulse-cli`) with Swift Argument Parser dependency
- [ ] Create shared library target (`GitPulseCore`) for domain logic shared between app and CLI
- [ ] Add Swift Argument Parser as a package dependency
- [ ] Add `.swiftlint.yml` or equivalent lint configuration
- [ ] Create basic `GitPulseApp.swift` with an empty window
- [ ] Create basic CLI entrypoint that prints version
- [ ] Verify `swift build` succeeds for all targets
- [ ] Verify `swift test` runs (even with zero tests)
- [ ] Set up GitHub Actions workflow for `swift build` and `swift test` on macOS
- [ ] Add `Package.resolved` to version control
- [ ] Remove or archive legacy Go/TypeScript/frontend files (or move to `legacy/` branch)
- [ ] Update `.gitignore` for Swift artifacts (`.build/`, `.swiftpm/`, `DerivedData/`)
- [ ] Update `README.md` to describe the Swift rewrite status

### Exit criteria

- [ ] `swift build` compiles all three targets (app, CLI, core library) without errors
- [ ] `swift test` exits cleanly
- [ ] CI runs green on push to `main`

### Verification

```bash
swift build
swift test
swift run gitpulse-cli --version
```

---

## Phase 2 -- Git scanning engine

### Objectives

Build the git integration layer in `GitPulseCore` that discovers repositories, probes their state, imports commit history, and detects push activity by shelling out to the git CLI.

### Checklist

- [ ] Implement `GitScanner` actor that runs git commands via `Process`
- [ ] Implement repository discovery: given a root path, find all `.git` directories recursively
- [ ] Implement repository probe: current branch, HEAD SHA, upstream ref, ahead/behind counts
- [ ] Implement working tree diff stats: unstaged additions, deletions, file count
- [ ] Implement staged diff stats: staged additions, deletions, file count
- [ ] Implement commit history import: parse `git log` output for a configurable date range
- [ ] Implement push detection: compare local HEAD to upstream HEAD
- [ ] Implement language breakdown: count lines by file extension (or integrate with `tokei` if available)
- [ ] Parse all git subprocess output defensively; treat repo-controlled strings as untrusted
- [ ] Handle edge cases: bare repos, detached HEAD, missing upstream, empty repos
- [ ] Unit tests for git output parsing with fixture data
- [ ] Integration tests against a real temporary git repository

### Exit criteria

- [ ] `GitScanner` can discover, probe, and import history from real local repositories
- [ ] All parsing is tested against known git output fixtures
- [ ] Error cases (missing git, corrupt repo, permission denied) return typed errors, not crashes

### Verification

```bash
swift test --filter GitScannerTests
```

---

## Phase 3 -- Data model and SwiftData storage

### Objectives

Define the full SwiftData schema mirroring the proven domain model: tracked targets, repositories, snapshots, file activity, commits, pushes, focus sessions, daily rollups, and achievements. Implement the analytics rebuild pipeline.

### Checklist

- [ ] Define `@Model` classes: `TrackedTarget`, `Repository`, `RepoStatusSnapshot`, `FileActivityEvent`, `CommitEvent`, `PushEvent`, `FocusSession`, `DailyRollup`, `Achievement`, `AppSettings`
- [ ] `Repository` tracks: name, root path, remote URL, default branch, include/exclude patterns, state (active/disabled/removed), monitoring flag
- [ ] `RepoStatusSnapshot` tracks: branch, HEAD SHA, upstream ref, ahead/behind, live diff stats, staged diff stats, language breakdown, observed timestamp
- [ ] `CommitEvent` tracks: SHA, authored date, author name/email, summary, branch, additions, deletions, files changed, merge flag
- [ ] `PushEvent` tracks: observed date, kind (local detected / remote confirmed), HEAD SHA, pushed commit count, upstream ref
- [ ] `FileActivityEvent` tracks: relative path, additions, deletions, activity kind, observed timestamp
- [ ] `FocusSession` tracks: start/end time, active minutes, associated repo IDs, event count, total changed lines
- [ ] `DailyRollup` tracks: scope, day, live/staged/committed additions and deletions, commit count, push count, session count, session minutes, score
- [ ] `Achievement` tracks: kind, unlocked timestamp, description
- [ ] Implement sessionization logic: group activity points into focus sessions using configurable gap threshold
- [ ] Implement daily rollup aggregation from stored events
- [ ] Implement streak calculation (current streak, longest streak, active today flag)
- [ ] Implement score calculation from daily activity
- [ ] Implement achievement evaluation rules
- [ ] Implement full analytics rebuild: clear derived data, recompute sessions, rollups, streaks, scores, achievements
- [ ] Configure `ModelContainer` with appropriate store location (`~/Library/Application Support/GitPulse/`)
- [ ] Unit tests for sessionization, rollup, streak, score, and achievement logic
- [ ] Integration tests that persist and query real SwiftData entities

### Exit criteria

- [ ] All domain entities persist and query correctly through SwiftData
- [ ] Analytics rebuild produces correct sessions, rollups, and achievements from fixture data
- [ ] Separate ledgers (live work, commits, pushes) remain distinct in the data model

### Verification

```bash
swift test --filter DataModelTests
swift test --filter AnalyticsTests
```

---

## Phase 4 -- Dashboard UI shell

### Objectives

Build the main SwiftUI window with navigation and page shells for all primary views. Wire real data from SwiftData through the view layer.

### Checklist

- [ ] Implement `DashboardView` as the main window content with sidebar navigation
- [ ] Implement navigation destinations: Dashboard, Repositories, Sessions, Achievements, Settings
- [ ] `DashboardView` displays: total repos tracked, today's commits, today's lines changed, current streak, today's score, recent activity summary
- [ ] `RepositoriesView` displays: list of tracked repos with name, path, health status, last activity, and quick stats
- [ ] `RepositoryDetailView` displays: full repo info, recent commits, working tree status, language breakdown, activity timeline
- [ ] `SessionsView` displays: list of focus sessions with duration, repos involved, and line counts
- [ ] `AchievementsView` displays: unlocked achievements with timestamps, streak summary, today's score
- [ ] `SettingsView` displays: configurable options (scan directories, gap threshold, include/exclude patterns, appearance)
- [ ] Implement empty states for each view when no data exists
- [ ] Implement loading states for long-running scans
- [ ] Implement first-run onboarding flow: add first repository or scan directory
- [ ] Wire `@Query` and `@Environment(\.modelContext)` for live SwiftData reads
- [ ] Implement operator action buttons: Add Repository, Import History, Rescan All, Rebuild Analytics
- [ ] Use `@Observable` view models where query composition or action orchestration is needed
- [ ] Respect system appearance (light/dark mode) and Dynamic Type

### Exit criteria

- [ ] All five primary views render with real SwiftData content
- [ ] Navigation between views works without state loss
- [ ] Operator actions trigger real git scanning and data updates
- [ ] Empty states and loading states display correctly

### Verification

```bash
swift build --target GitPulse
# Manual: launch app, add a repo, import history, verify dashboard populates
```

---

## Phase 5 -- Charts and visualizations

### Objectives

Build the data visualization layer using Swift Charts: commit activity heatmap, contribution graph, language breakdown, daily line counts, and session duration charts.

### Checklist

- [ ] Implement contribution graph (GitHub-style grid) showing daily commit/activity intensity over the past year
- [ ] Implement daily commit count bar chart for the past 30/90/365 days
- [ ] Implement daily lines changed area chart (additions vs deletions)
- [ ] Implement language breakdown pie/donut chart from latest snapshot data
- [ ] Implement session duration chart showing focus session lengths over time
- [ ] Implement hourly activity heatmap (hour of day vs day of week)
- [ ] Implement per-repository activity sparklines for the repositories list
- [ ] All charts respond to date range selection (7d / 30d / 90d / 1y / all)
- [ ] Charts animate on data load and range change
- [ ] Charts adapt to light/dark mode and respect accessibility settings
- [ ] Charts handle empty data gracefully (empty state, not a broken chart)
- [ ] Embed charts in the appropriate dashboard, repository detail, and sessions views

### Exit criteria

- [ ] At least six chart types render with real analytics data
- [ ] Date range filtering works across all time-series charts
- [ ] Charts are readable at default and increased Dynamic Type sizes

### Verification

```bash
swift build --target GitPulse
# Manual: verify each chart type renders with fixture data across light/dark mode
```

---

## Phase 6 -- Menu bar app

### Objectives

Add a persistent menu bar presence that shows quick stats, provides fast access to common actions, and opens the full dashboard window on demand.

### Checklist

- [ ] Implement `MenuBarExtra` with a custom icon (git branch glyph or pulse icon)
- [ ] Display in menu bar popover: today's commits, today's lines, current streak, active session indicator
- [ ] Add menu items: Open Dashboard, Rescan All, Import All, Rebuild Analytics, Quit
- [ ] Add recently active repositories as quick-access menu items
- [ ] Implement `NSStatusItem`-based click behavior: left click opens popover, right click opens menu
- [ ] Keep the menu bar item updated on a timer or via SwiftData observation
- [ ] Add option in Settings to launch at login (via `SMAppService` / `ServiceManagement`)
- [ ] Add option in Settings to show/hide the dock icon (accessory app mode via `LSUIElement`)
- [ ] Ensure the app can run as menu-bar-only or with both menu bar and dock presence

### Exit criteria

- [ ] Menu bar icon appears on launch and persists
- [ ] Popover displays current, accurate quick stats
- [ ] Menu bar actions trigger real operations
- [ ] Launch at login works when enabled

### Verification

```bash
swift build --target GitPulse
# Manual: launch app, verify menu bar icon, check popover stats, trigger rescan from menu
```

---

## Phase 7 -- CLI mode

### Objectives

Build a full CLI interface using Swift Argument Parser that mirrors the operator actions available in the GUI, sharing all scanning and analytics logic from `GitPulseCore`.

### Checklist

- [ ] Implement `gitpulse add <path>` to register a repository or discover repos under a folder
- [ ] Implement `gitpulse import [--all] [--days N] [--repo <path>]` to import commit history
- [ ] Implement `gitpulse rescan [--all] [--repo <path>]` to refresh repository snapshots
- [ ] Implement `gitpulse rebuild` to recompute all derived analytics
- [ ] Implement `gitpulse status` to display dashboard summary in the terminal
- [ ] Implement `gitpulse repos` to list tracked repositories with health and stats
- [ ] Implement `gitpulse detail <path>` to show full repository detail
- [ ] Implement `gitpulse sessions [--days N]` to list recent focus sessions
- [ ] Implement `gitpulse achievements` to list unlocked achievements and streaks
- [ ] Implement `gitpulse doctor` to check environment, git version, data directory, and config
- [ ] Implement `gitpulse config [key] [value]` to view or update settings
- [ ] All CLI commands share the same `ModelContainer` and `GitPulseCore` logic as the GUI
- [ ] Output formats: human-readable (default) and `--json` for machine consumption
- [ ] Proper exit codes: 0 for success, 1 for errors
- [ ] `--help` text for every command and subcommand
- [ ] Unit tests for CLI argument parsing and output formatting

### Exit criteria

- [ ] Every operator action available in the GUI is available from the CLI
- [ ] CLI reads from and writes to the same SwiftData store as the GUI app
- [ ] `gitpulse doctor` verifies the environment accurately

### Verification

```bash
swift run gitpulse-cli --help
swift run gitpulse-cli add ~/github
swift run gitpulse-cli import --all --days 30
swift run gitpulse-cli rescan --all
swift run gitpulse-cli rebuild
swift run gitpulse-cli status
swift run gitpulse-cli doctor
swift test --filter CLITests
```

---

## Phase 8 -- File watching and auto-refresh

### Objectives

Implement FSEvents-based directory monitoring so GitPulse automatically detects changes in watched repositories and refreshes analytics without requiring manual rescan.

### Checklist

- [ ] Implement `FileWatcher` actor using `DispatchSource.makeFileSystemObjectSource` or `FSEventStream` for monitored directories
- [ ] Watch for file system events in all active repository working trees
- [ ] Debounce rapid events (batch changes within a configurable window, default 5 seconds)
- [ ] On detected change: re-probe the affected repository's working tree status
- [ ] On detected change: update the relevant `RepoStatusSnapshot` in SwiftData
- [ ] Trigger incremental analytics refresh (re-sessionize recent activity, update today's rollup)
- [ ] Add Settings toggle: enable/disable auto-refresh
- [ ] Add Settings option: debounce interval
- [ ] Show "watching" indicator in repository list for actively monitored repos
- [ ] Handle repository deletion, move, and permission changes gracefully
- [ ] Pause watching when the app is in the background (configurable)
- [ ] Unit tests for debounce logic
- [ ] Integration tests for file change detection in a temporary repository

### Exit criteria

- [ ] File changes in a watched repository trigger automatic snapshot refresh within the configured debounce window
- [ ] Dashboard data updates reflect file watching without manual intervention
- [ ] Auto-refresh can be disabled per-repo and globally

### Verification

```bash
swift test --filter FileWatcherTests
# Manual: enable watching, edit a file in a tracked repo, verify dashboard updates within debounce window
```

---

## Phase 9 -- Polish and accessibility

### Objectives

Harden the app for daily use: keyboard navigation, VoiceOver support, performance optimization, error handling, and visual polish.

### Checklist

- [ ] Full keyboard navigation for all views (Tab, arrow keys, Enter, Escape)
- [ ] VoiceOver labels and hints for all interactive elements and charts
- [ ] Reduce motion support: disable chart animations when accessibility setting is active
- [ ] Performance profiling: ensure scan of 50+ repositories completes in under 10 seconds
- [ ] Lazy loading for large repository lists and long session histories
- [ ] Background scanning on a detached `Task` so UI never blocks
- [ ] Graceful error sheets for git failures, permission issues, and data corruption
- [ ] App icon (1024x1024 with proper macOS rounding)
- [ ] About window with version, build number, and license info
- [ ] Sparkle or similar update framework integration for direct-download updates
- [ ] Crash reporting opt-in (or rely on macOS built-in crash reports)
- [ ] Memory and energy profiling to ensure menu bar presence is lightweight
- [ ] Localization infrastructure (`String(localized:)`) even if only English ships initially
- [ ] User-facing changelog accessible from the app

### Exit criteria

- [ ] VoiceOver can navigate every view and read every chart
- [ ] No UI hangs during repository scanning or analytics rebuild
- [ ] Memory usage stays under 100MB with 50+ tracked repositories

### Verification

```bash
swift build -c release --target GitPulse
# Manual: Accessibility Inspector audit, Instruments profiling, full VoiceOver walkthrough
```

---

## Phase 10 -- Distribution

### Objectives

Package GitPulse for distribution via Homebrew, direct download, and optionally the Mac App Store. Sign, notarize, and automate the release pipeline.

### Checklist

- [ ] Configure Xcode project or `xcodebuild` for release signing with Developer ID
- [ ] Notarize the app bundle with `notarytool`
- [ ] Create `.dmg` installer with drag-to-Applications layout
- [ ] Create Homebrew cask formula (`homebrew-tap` repo or `homebrew-cask` PR)
- [ ] Automate release builds in GitHub Actions: build, sign, notarize, create GitHub Release with `.dmg` asset
- [ ] Install CLI binary to `/usr/local/bin/gitpulse` (or via Homebrew)
- [ ] Verify Gatekeeper passes on a clean macOS install
- [ ] Verify launch-at-login survives app updates
- [ ] Write migration guide for users coming from the Go/TypeScript version
- [ ] Update `README.md` to describe the native macOS app as the current product
- [ ] Add Mac App Store target (stretch goal: sandbox compliance, entitlements review)
- [ ] Tag release as `v1.0.0` when all distribution checks pass

### Exit criteria

- [ ] A new user can install GitPulse via `brew install --cask gitpulse` or by downloading and opening a `.dmg`
- [ ] The app passes Gatekeeper and notarization on a clean Mac
- [ ] The CLI is installable alongside the GUI app

### Verification

```bash
# CI release workflow
xcodebuild -scheme GitPulse -configuration Release archive
xcrun notarytool submit GitPulse.dmg --wait
brew install --cask gitpulse  # from tap
gitpulse doctor               # CLI verification
# Manual: install on a clean Mac, launch, add repos, verify full workflow
```

---

## Cross-phase verification gates

| Gate | Phases | Check |
|---|---|---|
| Core library compiles | 1-3 | `swift build --target GitPulseCore` |
| App target compiles | 1+ | `swift build --target GitPulse` |
| CLI target compiles | 1, 7 | `swift build --target gitpulse-cli` |
| Unit tests pass | All | `swift test` |
| Git scanning works on real repos | 2+ | `swift test --filter GitScannerTests` |
| SwiftData round-trips correctly | 3+ | `swift test --filter DataModelTests` |
| Analytics rebuild is deterministic | 3+ | `swift test --filter AnalyticsTests` |
| Dashboard renders with live data | 4+ | Manual launch and inspect |
| Charts render correctly | 5+ | Manual visual inspection across light/dark mode |
| Menu bar is responsive | 6+ | Manual menu bar interaction test |
| CLI mirrors GUI actions | 7+ | Run each CLI command and compare results |
| File watching triggers refresh | 8+ | Edit file in tracked repo, verify auto-update |
| Notarization passes | 10 | `xcrun notarytool` exit code 0 |

## Definition of done

The build is done only when all of these are true:

- [ ] GitPulse is a native macOS application written entirely in Swift
- [ ] SwiftUI renders the full dashboard, repository, session, achievement, and settings views
- [ ] Swift Charts provides commit activity, contribution graph, language breakdown, and session visualizations
- [ ] SwiftData stores all domain entities locally with no external database dependency
- [ ] The menu bar app shows quick stats and provides fast access to actions
- [ ] The CLI mode supports every operator action available in the GUI
- [ ] FSEvents-based file watching triggers automatic analytics refresh
- [ ] Git scanning works by shelling out to the git CLI with defensive parsing
- [ ] All analytics (sessions, rollups, streaks, scores, achievements) are rebuildable from stored events
- [ ] The app is signed, notarized, and distributable via Homebrew cask and direct download
- [ ] `README.md` and stable docs describe the native macOS app as the current product
- [ ] Legacy Go, TypeScript, and frontend code is removed or archived
- [ ] `swift test` passes with meaningful coverage across core, CLI, and data model

## When to retire this file

Delete `BUILD.md` when:

- All phases are complete and verified
- The app is distributed and in active use
- Stable docs (`README.md`, inline code docs) fully describe current truth
- No phase work remains in flight

At that point, fold any remaining operational guidance into `README.md` or `docs/` and remove this file. A `BUILD.md` is a build manual, not permanent repo furniture.

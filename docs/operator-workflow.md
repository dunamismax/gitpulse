# GitPulse Operator Workflow

GitPulse is manual-first today. It does not ship a background watcher, poller, or packaged desktop wrapper. The supported product is a Go CLI plus a local web dashboard served through `gitpulse serve`, with a source-run terminal preview available through `gitpulse tui`.

## Current operating truth

- Go owns persistence, analytics, and the JSON API
- the shipped browser surface is the Astro + Vue frontend under `frontend/web/`
- SQLite is the local-first data store
- the supported ingestion loop is add, import, rescan, rebuild, inspect
- analytics are rebuilt from stored local events
- packaged desktop releases are not implemented in this repo

## Daily operator loop

### 1. Build and start the local dashboard

When running from source, build the web frontend first:

```bash
cd frontend
bun install
bun run --filter @gitpulse/web build
cd ..

go run ./cmd/gitpulse serve
```

Open <http://127.0.0.1:7467>. The Go server serves the built frontend and handles `/api/*` directly.

### 2. Add a repository or parent folder

```bash
go run ./cmd/gitpulse add /path/to/code
```

This only registers local git roots so the rest of the runbook can act on them explicitly.

### 3. Import recent history

```bash
go run ./cmd/gitpulse import --all --days 30
```

Use this when you want a consistent backfill window across tracked repositories or after adding older repos that need more history pulled in.

### 4. Rescan working trees

```bash
go run ./cmd/gitpulse rescan --all
```

This refreshes live git status, ahead/behind state, and working-tree change totals. It does not import commits or rebuild analytics for you.

### 5. Rebuild analytics

```bash
go run ./cmd/gitpulse rebuild-rollups
```

This recomputes sessions, rollups, streaks, score, and achievements from stored local events.

### 6. Inspect the results

Use the dashboard, repository pages, sessions, achievements, settings, the terminal preview via `go run ./cmd/gitpulse tui`, or the Go JSON API to confirm the new state.

## What GitPulse does not do yet

- no background watcher or poller keeps repositories fresh automatically
- no packaged desktop release flow exists in-tree
- real-workspace smoke runs are still worth doing manually from time to time
- fuzz coverage for git parsing is still missing
- the terminal lane now exists as a source-run preview, but Phase 4 still needs deeper keyboard polish and real-workspace validation before it is done

## Verification

Run the smallest truthful checks first, then broaden as needed:

```bash
go test ./...
go build ./...
go vet ./...
go run ./cmd/gitpulse tui --once --screen repositories
cd frontend && bun run check && bun run --filter @gitpulse/web build
```

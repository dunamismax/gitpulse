# Contributing to GitPulse

GitPulse is an active Go application with a shipped Astro + Vue operator frontend served through the Go runtime. Read [README.md](README.md), [docs/operator-workflow.md](docs/operator-workflow.md), and [docs/architecture.md](docs/architecture.md).

## Development setup

### Prerequisites

- Go 1.26.1
- Bun 1.3+
- Git 2.30+

### First build

```bash
git clone https://github.com/dunamismax/gitpulse.git
cd gitpulse
cd frontend && bun install && bun run --filter @gitpulse/web build
cd ..
go test ./...
go build ./cmd/gitpulse
```

### Minimal local config

GitPulse defaults to a SQLite database in the platform data directory, so a config file is optional.

Optional explicit config:

```toml
[database]
path = "/absolute/path/to/gitpulse.db"
```

See [gitpulse.example.toml](gitpulse.example.toml) for the full config surface.

## Architecture rules

GitPulse uses a Go-first backend with a Bun workspace frontend.

| Path | Owns |
|------|------|
| `cmd/gitpulse` | CLI command wiring and frontend build discovery |
| `frontend/shared` | shared TypeScript contracts, API client, route maps, and formatters |
| `frontend/web` | Astro + Vue browser frontend |
| `frontend/tui` | OpenTUI foundation shell and future terminal console |
| `internal/config` | config loading and platform paths |
| `internal/db` | SQLite connection, schema, migrations, and plain SQL queries |
| `internal/filter` | include/exclude matching |
| `internal/git` | git subprocess integration and parsing |
| `internal/metrics` | score, streak, achievement logic |
| `internal/models` | shared data and API/view structs |
| `internal/runtime` | orchestration and view assembly |
| `internal/sessions` | sessionization |
| `internal/web` | HTTP handlers, JSON API, and static frontend serving |
| `python-ui` | legacy migration reference, not active product runtime |

Rules:

- New backend implementation work goes in Go.
- The shipped browser surface lives in `frontend/web`, but persistence and analytics stay Go-owned.
- Keep persistence relational, local, and Go-owned.
- Keep plain SQL explicit in `internal/db`.
- Keep repo-controlled strings treated as untrusted input.
- Keep docs aligned when product behavior changes.
- Do not document release workflows that are not present in-tree.

## Quality gates

Run the narrowest useful checks first:

```bash
go test ./...
go build ./...
go vet ./...
go run ./cmd/gitpulse --help
cd frontend && bun run check && bun run --filter @gitpulse/web build
```

If your change touches runtime or database behavior, prefer adding a focused integration test against a temporary SQLite file.

## Documentation expectations

Update docs in the same change when behavior shifts:

- `README.md` for user-facing behavior
- `docs/operator-workflow.md` for the current manual operator loop and verification
- `docs/architecture.md` for active structure
- `gitpulse.example.toml` for config surface changes

## Commit messages

Use clear, direct commit messages describing the actual change.

## License

By contributing, you agree that your contributions are licensed under the MIT License.

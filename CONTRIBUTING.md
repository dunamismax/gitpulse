# Contributing to GitPulse

GitPulse is an active Go application with a Bun + React + Vite browser UI. Read [BUILD.md](BUILD.md) first, then [docs/architecture.md](docs/architecture.md).

## Development setup

### Prerequisites

- Go 1.26.1
- Bun 1.1+
- Git 2.30+

### First build

```bash
git clone https://github.com/dunamismax/gitpulse.git
cd gitpulse
cd web && bun install && bun run build
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

GitPulse uses a Go-first backend with a React + Vite SPA browser UI.

| Path | Owns |
|------|------|
| `cmd/gitpulse` | CLI command wiring |
| `web` | React + Vite SPA source, routing, styles, and browser-side TypeScript |
| `internal/config` | config loading and platform paths |
| `internal/db` | SQLite connection, schema, migrations, and plain SQL queries |
| `internal/filter` | include/exclude matching |
| `internal/git` | git subprocess integration and parsing |
| `internal/metrics` | score, streak, achievement logic |
| `internal/models` | shared data and API/view structs |
| `internal/runtime` | orchestration and view assembly |
| `internal/sessions` | sessionization |
| `internal/web` | HTTP handlers, JSON API, and SPA serving |

Rules:

- New backend implementation work goes in Go.
- React + Vite own the browser page and routing lane.
- TanStack Router handles client-side navigation, and TanStack Query handles server-state fetching.
- Keep persistence relational, local, and Go-owned.
- Keep plain SQL explicit in `internal/db`.
- Keep repo-controlled strings treated as untrusted input.
- Keep docs aligned when product behavior changes.
- Do not document release workflows that are not present in-tree.

## Quality gates

Run the narrowest useful checks first:

```bash
cd web && bun run build
cd ..
go test ./...
go build ./cmd/gitpulse
go run ./cmd/gitpulse --help
```

If your change touches runtime or database behavior, prefer adding a focused integration test against a temporary SQLite file.

## Documentation expectations

Update docs in the same change when behavior shifts:

- `README.md` for user-facing behavior
- `BUILD.md` for execution truth and verification
- `docs/architecture.md` for active structure
- `gitpulse.example.toml` for config surface changes

## Commit messages

Use clear, direct commit messages describing the actual change.

## License

By contributing, you agree that your contributions are licensed under the MIT License.

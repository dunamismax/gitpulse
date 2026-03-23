# Contributing to GitPulse

GitPulse is an active Go application with a Bun/Astro frontend. Read [BUILD.md](BUILD.md) first, then [docs/architecture.md](docs/architecture.md).

## Development setup

### Prerequisites

- Go 1.25+
- Bun 1.1+
- Git 2.30+
- PostgreSQL 14+ for the current implementation

### First build

```bash
git clone https://github.com/dunamismax/gitpulse.git
cd gitpulse
cd frontend && bun install && bun run build
cd ..
go test ./...
go build ./cmd/gitpulse
```

### Minimal local config

The current code still expects PostgreSQL. Do not start a partial storage migration in an unrelated change.

Create a database:

```bash
createdb gitpulse
```

Then configure:

```toml
[database]
dsn = "postgres://localhost/gitpulse?sslmode=disable"
```

See [gitpulse.example.toml](gitpulse.example.toml) for the full config surface.

## Architecture rules

GitPulse currently uses a Go-first backend with an Astro browser frontend.

| Path | Owns |
|------|------|
| `cmd/gitpulse` | CLI command wiring |
| `frontend` | Astro pages, layout, styles, and browser-side TypeScript/Alpine |
| `internal/config` | config loading and platform paths |
| `internal/db` | current pgx pool, schema, plain SQL queries |
| `internal/filter` | include/exclude matching |
| `internal/git` | git subprocess integration and parsing |
| `internal/metrics` | score, streak, achievement logic |
| `internal/models` | shared data and API/view structs |
| `internal/runtime` | orchestration and view assembly |
| `internal/sessions` | sessionization |
| `internal/web` | HTTP handlers, JSON API, and frontend serving |

Rules:

- New backend implementation work goes in Go.
- Astro owns the browser page/layout lane.
- Alpine handles light browser interaction; avoid heavy hydration unless it clearly earns its keep.
- Database work stays on the current PostgreSQL implementation unless the change is explicitly about the storage migration.
- GitPulse is doctrinally SQLite-shaped, but this repo does not yet have a safe SQLite path implemented.
- Keep persistence relational and Go-owned.
- Keep plain SQL via `pgx/v5` unless backend complexity later earns `sqlc`.
- Do not add MongoDB.
- Keep repo-controlled strings treated as untrusted input.
- Keep docs aligned when product behavior changes.
- Do not document release workflows that are not present in-tree.

## Quality gates

Run the narrowest useful checks first:

```bash
cd frontend && bun run build
cd ..
go test ./...
go build ./cmd/gitpulse
go run ./cmd/gitpulse --help
```

If your change touches runtime/database behavior, prefer adding an integration test once the current PostgreSQL harness exists, and keep future SQLite migration work explicit rather than incidental.

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

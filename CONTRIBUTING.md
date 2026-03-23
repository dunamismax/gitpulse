# Contributing to GitPulse

GitPulse is mid-rewrite. Read [BUILD.md](BUILD.md) first, then [REWRITE_TRACKER.md](REWRITE_TRACKER.md), then [docs/architecture.md](docs/architecture.md).

## Development setup

### Prerequisites

- Go 1.25+
- Git 2.30+
- PostgreSQL 14+

### First build

```bash
git clone https://github.com/dunamismax/gitpulse.git
cd gitpulse
go mod tidy
go test ./...
go build ./cmd/gitpulse
```

### Minimal local config

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

GitPulse currently uses a Go-first layout.

| Path | Owns |
|------|------|
| `cmd/gitpulse` | CLI command wiring |
| `internal/config` | config loading and platform paths |
| `internal/db` | pgx pool, schema, raw SQL queries |
| `internal/filter` | include/exclude matching |
| `internal/git` | git subprocess integration and parsing |
| `internal/metrics` | score, streak, achievement logic |
| `internal/models` | shared data and view structs |
| `internal/runtime` | orchestration and view assembly |
| `internal/sessions` | sessionization |
| `internal/web` | HTTP handlers and rendering |

Rules:

- New implementation work goes in Go, not Rust.
- Database work stays PostgreSQL-only.
- Use raw SQL via `pgx/v5`; do not add an ORM.
- Keep repo-controlled strings treated as untrusted input.
- Keep docs aligned when product behavior changes.

## Quality gates

Run the narrowest useful checks first:

```bash
go test ./...
go build ./cmd/gitpulse
go run ./cmd/gitpulse --help
```

If your change touches runtime/database behavior, prefer adding an integration test once the temporary PostgreSQL harness exists.

## Documentation expectations

Update docs in the same change when behavior shifts:

- `README.md` for user-facing behavior
- `BUILD.md` for execution truth and verification
- `REWRITE_TRACKER.md` for resumable rewrite state
- `docs/architecture.md` for active structure
- `gitpulse.example.toml` for config surface changes

## Legacy code note

The old Rust workspace is still in the repository as migration reference. Do not add new product behavior there unless the change is explicitly about extracting parity information for the Go rewrite.

## Commit messages

Use clear, direct commit messages describing the actual change.

## License

By contributing, you agree that your contributions are licensed under the MIT License.

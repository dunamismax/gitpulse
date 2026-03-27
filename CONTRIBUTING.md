# Contributing to GitPulse

GitPulse is an active Go application with a Python operator UI served through the Go runtime. Read [BUILD.md](BUILD.md) first, then [docs/architecture.md](docs/architecture.md).

## Development setup

### Prerequisites

- Go 1.26.1
- Python 3.14+
- `uv`
- Git 2.30+

### First build

```bash
git clone https://github.com/dunamismax/gitpulse.git
cd gitpulse
go test ./...
go build ./cmd/gitpulse
cd python-ui && uv sync
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

GitPulse uses a Go-first backend with a FastAPI + Jinja2 + htmx operator UI.

| Path | Owns |
|------|------|
| `cmd/gitpulse` | CLI command wiring and managed Python UI launch |
| `python-ui` | FastAPI templates, htmx flows, static assets, and Python-side UI tests |
| `internal/config` | config loading and platform paths |
| `internal/db` | SQLite connection, schema, migrations, and plain SQL queries |
| `internal/filter` | include/exclude matching |
| `internal/git` | git subprocess integration and parsing |
| `internal/metrics` | score, streak, achievement logic |
| `internal/models` | shared data and API/view structs |
| `internal/runtime` | orchestration and view assembly |
| `internal/sessions` | sessionization |
| `internal/web` | HTTP handlers, JSON API, and UI proxying |

Rules:

- New backend implementation work goes in Go.
- The Python UI owns the browser surface, but not persistence or analytics logic.
- Keep persistence relational, local, and Go-owned.
- Keep plain SQL explicit in `internal/db`.
- Keep repo-controlled strings treated as untrusted input.
- Keep docs aligned when product behavior changes.
- Do not document release workflows that are not present in-tree.

## Quality gates

Run the narrowest useful checks first:

```bash
go test ./...
go build ./cmd/gitpulse
go run ./cmd/gitpulse --help
cd python-ui && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
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

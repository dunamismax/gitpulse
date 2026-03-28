# GitPulse Python UI

FastAPI + Jinja2 operator surface for the GitPulse Go runtime.

The Python UI is now the default browser frontend for GitPulse. `gitpulse serve` launches this app on an internal loopback port and reverse-proxies browser requests to it while the Go runtime continues to own the JSON API, persistence, and analytics logic.

GitPulse is manual-first today. The UI exposes explicit import, rescan, and rebuild controls instead of pretending a background watcher is already shipping.

## What this UI provides

- server-rendered dashboard, repositories, repository detail, sessions, achievements, and settings pages
- typed HTTP client for the Go JSON API
- repository management actions and settings writes forwarded through the Go API
- vendored local Alpine.js and htmx assets, with no CDN dependency at runtime
- actionable backend-unavailable and transport-error guidance tied to the configured Go API base URL
- repository freshness signals from existing Go API fields, including snapshot timing, repo update timing, and recent push visibility on repo detail
- first-run empty-state guidance across dashboard, repositories, repository detail, sessions, achievements, and settings
- explicit import, rescan, and rebuild runbook controls with inline long-running feedback and Go-backed completion summaries
- pytest coverage for page, action, and transport-error flows

## Run locally

### Main product path

```bash
go run ./cmd/gitpulse serve
```

Open <http://127.0.0.1:7467>.

The Go server launches the Python UI automatically and reverse-proxies browser requests to it. On first run, `uv` may take a few extra seconds to install Python dependencies.

### Frontend-only development

If you want to iterate on the Python UI directly, run it standalone against the Go API:

```bash
go run ./cmd/gitpulse serve
# or any other Go API origin you want the UI to target

cd python-ui
uv sync
uv run gitpulse-ui
```

Open <http://127.0.0.1:8001>.

## Configuration

The Python UI reads these environment variables:

- `GITPULSE_UI_API_BASE_URL` - base URL for the Go backend, default `http://127.0.0.1:7467`
- `GITPULSE_UI_HOST` - bind host for the Python UI, default `127.0.0.1`
- `GITPULSE_UI_PORT` - bind port for the Python UI, default `8001`

`gitpulse serve` sets these automatically for the managed subprocess it launches.

## Verify

```bash
uv sync
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

# GitPulse Python UI

FastAPI + Jinja2 operator surface for the existing GitPulse Go runtime.

This directory is the first frontend rewrite lane. It keeps the Go backend and JSON API intact while replacing the browser UI with a server-rendered Python app that uses htmx and Alpine.js instead of Bun, TypeScript, and React.

## Current checkpoint

Implemented in this checkpoint:

- server-rendered dashboard, repositories, repository detail, sessions, achievements, and settings pages
- typed HTTP client for the Go JSON API
- repository management actions and settings writes forwarded through the Python UI
- vendored local Alpine.js and htmx assets, with no CDN dependency at runtime
- actionable backend-unavailable and transport-error guidance tied to the configured Go API base URL
- repository freshness signals from existing Go API fields, including snapshot timing, repo update timing, and recent push visibility on repo detail
- first-run empty-state guidance across dashboard, repositories, repository detail, sessions, achievements, and settings
- explicit import, rescan, and rebuild runbook controls with inline long-running feedback and Go-backed completion summaries
- pytest coverage for page, action, and transport-error flows

## Run locally

Start the Go backend first so the JSON API is available on `http://127.0.0.1:7467`:

```bash
go run ./cmd/gitpulse serve
```

Then start the Python UI:

```bash
cd python-ui
uv sync
uv run gitpulse-ui
```

Open <http://127.0.0.1:8001>.

> This checkpoint still runs as a separate FastAPI process. `gitpulse serve` continues to serve the React build from `web/dist` until the repo chooses and verifies a Python cutover mechanism.

## Configuration

The Python UI reads these environment variables:

- `GITPULSE_UI_API_BASE_URL` - base URL for the Go backend, default `http://127.0.0.1:7467`
- `GITPULSE_UI_HOST` - bind host for the Python UI, default `127.0.0.1`
- `GITPULSE_UI_PORT` - bind port for the Python UI, default `8001`

## Verify

```bash
uv sync
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

# GitPulse Python UI

Legacy FastAPI + Jinja2 migration reference for GitPulse.

## Current truth

- `gitpulse serve` no longer launches this app
- the shipped browser frontend is now the Astro + Vue app under `frontend/web/`
- this directory is retained temporarily as a Phase 5 cleanup reference while the repo removes the old browser lane completely
- Python is no longer a runtime dependency for the shipped GitPulse browser surface

## What this directory contains

- the previous server-rendered dashboard, repositories, repository detail, sessions, achievements, and settings pages
- the old htmx and Alpine-based operator flows
- the prior Python-side tests and local static assets used before the browser cutover

## What to use instead

For the active product path:

```bash
cd frontend
bun install
bun run --filter @gitpulse/web build
cd ..
go run ./cmd/gitpulse serve
```

For current frontend development guidance, read [`frontend/README.md`](../frontend/README.md).

## Status

This directory is legacy code, not the active runtime path. It should be removed once the remaining Phase 5 repo cleanup is complete.

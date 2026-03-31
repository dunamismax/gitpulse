# GitPulse frontend workspace

The GitPulse frontend workspace is now the shipped browser lane for the product.

Current truth:

- `gitpulse serve` now serves the built Astro + Vue frontend from `frontend/web/dist`
- Go remains the only backend and system of record
- `frontend/shared` owns the shared TypeScript contracts and API client for both frontend lanes
- `frontend/tui` is still only a foundation shell. The real terminal console has not been built yet.

Workspace packages:

- `shared/`: shared API client, contract types, formatting helpers, route maps, screen maps, and operator action metadata
- `web/`: shipped Astro + Vue browser frontend consumed by `gitpulse serve`
- `tui/`: minimal Bun foundation shell wired to the live Go backend

Local setup:

```bash
cd frontend
bun install
bun run --filter @gitpulse/web build
```

Local development:

```bash
# from the repo root, start the Go runtime on the normal API origin
go run ./cmd/gitpulse serve

# in another shell, start the Astro dev server
cd frontend
bun run --filter @gitpulse/web dev

# optional: preview the built browser app directly
bun run --filter @gitpulse/web preview

# terminal foundation shell
bun run --filter @gitpulse/tui dev
```

The browser frontend defaults to same-origin in shipped mode and uses the Astro dev proxy for `/api` during local development. If needed, you can still override the backend origin at build time with `GITPULSE_API_BASE_URL`.

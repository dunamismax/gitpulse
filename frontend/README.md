# GitPulse frontend workspace

Phase 2 foundation for the GitPulse frontend migration.

Current truth:

- `python-ui/` is still the shipped browser surface
- Go remains the only backend and system of record
- this workspace exists to keep the TypeScript contract, route maps, and local dev wiring shared before Phase 3 or Phase 4 UI work

Workspace packages:

- `shared/`: shared API client, contract types, formatting helpers, route maps, screen maps, and operator action metadata
- `web/`: minimal Astro + Vue foundation shell wired to the live Go backend
- `tui/`: minimal Bun foundation shell wired to the live Go backend

Local dev:

```bash
cd frontend
bun install

# browser foundation shell
bun run --filter @gitpulse/web dev

# terminal foundation shell
bun run --filter @gitpulse/tui dev
```

Both packages default to `http://127.0.0.1:7467` and can be pointed elsewhere with `GITPULSE_API_BASE_URL`.

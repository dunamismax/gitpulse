# GitPulse frontend workspace

Phase 3 web migration is now in progress for the GitPulse frontend workspace.

Current truth:

- `python-ui/` is still the shipped browser surface
- Go remains the only backend and system of record
- this workspace now holds the shared TypeScript contract plus the in-progress Astro web app and future OpenTUI lane

Workspace packages:

- `shared/`: shared API client, contract types, formatting helpers, route maps, screen maps, and operator action metadata
- `web/`: real Astro + Vue SSR operator app wired to the live Go backend; `gitpulse serve` cutover is still pending
- `tui/`: minimal Bun foundation shell wired to the live Go backend

Local dev:

```bash
cd frontend
bun install

# browser app (direct Astro dev/preview)
bun run --filter @gitpulse/web dev

# terminal foundation shell
bun run --filter @gitpulse/tui dev
```

Both packages default to `http://127.0.0.1:7467` and can be pointed elsewhere with `GITPULSE_API_BASE_URL`.

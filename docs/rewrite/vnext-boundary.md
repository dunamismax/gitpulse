# vNext Boundary

This document defines the Phase 0 rewrite boundary for the approved destination stack:

- TypeScript
- Bun
- Astro
- Vue where it clearly earns the interaction cost
- Elysia
- Zod
- PostgreSQL
- Docker Compose
- Caddy

These are target-state decisions for the rewrite. The repo now contains a Phase 1 bootstrap that follows this boundary under `apps/`, `packages/`, `db/migrations/`, `deploy/`, and `docker-compose.yml`, but parity and cutover work are still ahead.

## Boundary Decisions

| Area | Phase 0 decision |
| --- | --- |
| Repo shape | One Bun workspace at the repo root with `apps/api`, `apps/web`, `packages/contracts`, `packages/core`, and `packages/config`. `packages/ui` stays optional until it is earned. |
| Services | Four runtime services in the shipped path: `caddy`, `web`, `api`, and `postgres`. |
| Browser origin | One public origin only. Browsers talk to Caddy, not directly to Astro or Elysia. |
| Default local edge | Keep `127.0.0.1:7467` as the default local origin so rewrite-era docs and operator habits do not churn unnecessarily. |
| Internal ports | `api=3001`, `web=4321`, `postgres=5432`, `caddy=80` inside Compose, with host `7467 -> caddy:80` by default. |
| API ownership | Elysia owns JSON routes and operator actions. Astro owns page delivery and route shells. |
| Contract ownership | Shared request and response schemas live in `packages/contracts` and are the only cross-app API contract source of truth. |
| Database ownership | PostgreSQL is the only primary application database in the target state. SQLite becomes import input only after cutover. |
| Repository path contract | For the first cutover, tracked repo roots must be mounted into the API container at the same absolute paths they had on the host. This avoids rewriting `tracked_targets.path` and `repositories.root_path` during SQLite import. |

## Target Repo Layout

```text
gitpulse/
  apps/
    api/
      src/
        routes/
        services/
        db/
        lib/
        index.ts
    web/
      src/
        pages/
        layouts/
        components/
        lib/
        styles/
  packages/
    contracts/
      src/
    core/
      src/
    config/
      src/
    ui/                  # optional; add only if shared UI is actually earned
      src/
  db/
    migrations/
    seeds/
  deploy/
    Caddyfile
  scripts/
    migrate.ts
    import-sqlite.ts
    smoke.ts
  docker-compose.yml
  bun.lock
  package.json
  tsconfig.base.json
  BUILD.md
```

Repo layout rules:

- `apps/api` owns HTTP routes, action execution, database access wiring, and background entrypoints if they are added later.
- `apps/web` owns Astro pages, Vue islands, typed data fetchers, and UI behavior only.
- `packages/core` owns git integration, analytics rebuild logic, repository orchestration, explicit PostgreSQL query modules, and any logic that should stay usable from both API handlers and smoke tooling.
- `packages/config` owns environment parsing, path helpers, and filesystem/config abstractions.
- `packages/contracts` owns Zod schemas and inferred types that cross the API boundary.
- `packages/ui` is optional and must not appear until duplicated UI primitives justify it.

## Container Topology

```text
browser
  |
  v
caddy :80 in container, host 127.0.0.1:7467
  |-- /api/* ----------------------> api :3001
  |-- all other paths -------------> web :4321
  |
  `-- same origin for HTML, assets, and JSON

api :3001
  |-- PostgreSQL network access ---> postgres :5432
  |-- bind mounts -----------------> GitPulse config/data paths
  `-- bind mounts -----------------> tracked repo roots at identical absolute host paths

web :4321
  `-- no direct browser exposure in shipped mode

postgres :5432
  `-- persistent database volume
```

Container rules:

- The API container is the only runtime that needs access to git repositories on disk.
- The web container does not get repo mounts and should not shell out to git.
- Direct host exposure for the API and web services is a development convenience only, not the shipped routing model.
- The first shipped Compose shape should use identity bind mounts for tracked repo roots. Path remapping support can be added later, but it is not part of the first credible cutover.

## Same-origin Routing Contract

Shipped routing contract for vNext:

- `Caddy` is the only public HTTP edge in shipped mode.
- `GET /api/*` and `POST /api/*` terminate in Elysia.
- All browser page routes and built assets terminate in Astro.
- Browser-side code uses relative URLs like `/api/...` in shipped mode. No shipped browser build should require a cross-origin `API_BASE_URL`.
- Internal service-to-service URLs may exist inside Compose, but they stay private to the stack.

The rewrite is allowed to use direct `api:3001` or `web:4321` access for source-run development, but those are not the parity target.

## Environment Contract

The rewrite should standardize on the following environment contract.

### Shared app env

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `GITPULSE_ENV` | `development` | `api`, `web` | Allowed values should be `development`, `test`, and `production`. |
| `GITPULSE_LOG_LEVEL` | `info` | `api`, `web` | Common runtime log level. |
| `GITPULSE_PUBLIC_ORIGIN` | `http://127.0.0.1:7467` | `web`, `api` | Canonical browser-facing origin used in generated URLs and smoke checks. |

### API env

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `GITPULSE_API_PORT` | `3001` | `api` | Internal listen port only. |
| `GITPULSE_DATABASE_URL` | none, required | `api` | Canonical PostgreSQL connection string consumed by the API. |
| `GITPULSE_CONFIG_DIR` | `/var/lib/gitpulse/config` | `api` | Persistent config directory for settings and operator-owned files. |
| `GITPULSE_DATA_DIR` | `/var/lib/gitpulse/data` | `api` | Persistent data directory for importer artifacts, smoke outputs, and local state that is not in PostgreSQL. |

### Web env

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `GITPULSE_WEB_PORT` | `4321` | `web` | Internal Astro listen port. |
| `GITPULSE_INTERNAL_API_ORIGIN` | `http://api:3001` | `web` | Server-side fetch origin for Astro only. Browser code still uses same-origin `/api`. |

### Compose and Postgres env

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `GITPULSE_EDGE_PORT` | `7467` | `caddy`, Compose | Host port mapped to the Caddy container. |
| `POSTGRES_DB` | `gitpulse` | `postgres` | Standard PostgreSQL container env. |
| `POSTGRES_USER` | `gitpulse` | `postgres` | Standard PostgreSQL container env. |
| `POSTGRES_PASSWORD` | none, required | `postgres` | Standard PostgreSQL container env. Prefer a secrets file when implementation lands. |
| `POSTGRES_PORT` | `5432` | `postgres` | Internal Postgres listen port. Host publishing stays optional. |

Environment rules:

- Do not introduce separate browser API URL env vars for shipped mode.
- Keep the application contract centered on `GITPULSE_DATABASE_URL` instead of scattering host, port, user, and database parsing across the API code.
- Keep repository mount configuration in Compose, not in the browser or API contract layer.

## Explicit Boundaries

These items are outside the Phase 0 boundary even though they may happen later:

- no decision yet on whether post-cutover CLI compatibility survives
- no decision yet on whether the TUI survives cutover
- no automatic watchers or pollers in the first shipped rewrite
- no desktop packaging work in the first shipped rewrite
- no ORM adoption by default

# Rewrite Boundary Docs

These Phase 0 docs freeze the current shipped Go contract and define the boundary for the approved Bun + TypeScript rewrite tracked in `BUILD.md`.

Current product truth is still documented in `README.md`, `docs/architecture.md`, and `docs/operator-workflow.md`. The docs here are forward-looking boundary material for the rewrite only.

## Docs

- `docs/rewrite/current-contract.md`: current CLI, API, config, schema, operator workflow, and parity-critical behaviors that the rewrite must preserve.
- `docs/rewrite/vnext-boundary.md`: approved vNext repo layout, service topology, ports, same-origin routing, environment contract, and the current Phase 1 bootstrap footprint.
- `docs/rewrite/sqlite-to-postgres.md`: table-by-table SQLite to PostgreSQL mapping, type rules, and ledger-preservation plan.
- `docs/rewrite/parity-fixtures-and-cutover.md`: deterministic fixture plan, parity assertions, cutover checklist, and explicit non-goals.

## Status

- Phase 0 boundary docs are complete.
- Phase 1 bootstrap is now verified under `apps/`, `packages/`, `db/migrations/`, `deploy/`, `scripts/`, and `docker-compose.yml`.
- The shipped product is still the Go + SQLite runtime. The Bun, Elysia, PostgreSQL, Docker Compose, and Caddy lane is only a verified bootstrap right now, not parity or cutover.
- `bun run verify:vnext`, `docker compose up -d`, and `bun run smoke:vnext` are now green for the vNext bootstrap, including PostgreSQL schema application through `scripts/migrate.ts` during API startup.
- Early Phase 2 groundwork is now verified in `packages/core` with explicit PostgreSQL query modules, normalization helpers, and a real round-trip integration test against PostgreSQL.
- If current code and these docs disagree about shipped behavior, the Go code wins until cutover.

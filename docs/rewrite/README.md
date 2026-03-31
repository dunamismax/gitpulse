# Rewrite Boundary Docs

These Phase 0 docs freeze the current shipped Go contract and define the boundary for the approved Bun + TypeScript rewrite tracked in `BUILD.md`.

Current product truth is still documented in `README.md`, `docs/architecture.md`, and `docs/operator-workflow.md`. The docs here are forward-looking boundary material for the rewrite only.

## Docs

- `docs/rewrite/current-contract.md`: current CLI, API, config, schema, operator workflow, and parity-critical behaviors that the rewrite must preserve.
- `docs/rewrite/vnext-boundary.md`: approved vNext repo layout, service topology, ports, same-origin routing, and environment contract.
- `docs/rewrite/sqlite-to-postgres.md`: table-by-table SQLite to PostgreSQL mapping, type rules, and ledger-preservation plan.
- `docs/rewrite/parity-fixtures-and-cutover.md`: deterministic fixture plan, parity assertions, cutover checklist, and explicit non-goals.

## Status

- Phase 0 is documentation and boundary setting only.
- These docs do not mean the Bun, Elysia, PostgreSQL, Docker Compose, or Caddy runtime exists in this repo yet.
- If current code and these docs disagree about shipped behavior, the Go code wins until cutover.

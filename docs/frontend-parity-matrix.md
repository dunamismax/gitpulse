# GitPulse Frontend Parity Matrix

Purpose: minimum Phase 0 inventory to bound the frontend migration in [BUILD.md](../BUILD.md) before Astro + Vue or OpenTUI work starts.

Current truth as of 2026-03-30:

- the shipped browser surface is still `python-ui/`
- Go remains the only backend and system of record
- the migration target is still dual frontend: `frontend/web` first, then `frontend/tui`
- Phase 2 foundation now exists under `frontend/`, including the shared TypeScript contract and shared route and screen maps in `frontend/shared/src/surfaces.ts`
- this document is an inventory and contract boundary, not a claim that the migration is complete

## Target frontend workspace

Planned repo layout from `BUILD.md`:

```text
frontend/
  shared/
  web/
  tui/
```

Ownership boundary:

- Go owns orchestration, validation, persistence, analytics, and action execution
- frontend code owns rendering, navigation, input state, and presentation-level formatting
- both future frontends should consume the same Go-owned JSON contracts

## Page and workflow parity

| Surface | Current browser route | Current Python UI files | Go read endpoints | Go action endpoints | Phase 1 contract notes |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `/` | `dashboard.html`, `partials/action_center.html`, `partials/repository_card.html` | `GET /api/dashboard` | `POST /api/actions/import`, `POST /api/actions/rescan`, `POST /api/actions/rebuild` | Dashboard contract must expose summary, trends, activity feed, and repository cards without template-specific shaping |
| Repositories list | `/repositories` | `repositories.html`, `partials/repository_section.html`, `partials/repository_card.html` | `GET /api/repositories` | `POST /api/repositories/add`, `POST /api/repositories/{id}/refresh`, `POST /api/repositories/{id}/toggle`, `POST /api/repositories/{id}/remove` | Repository list should be an explicit collection payload, not a bare array |
| Repository detail | `/repositories/{id}` | `repository_detail.html` | `GET /api/repositories/{id}` | `POST /api/repositories/{id}/import`, `POST /api/repositories/{id}/refresh`, `POST /api/repositories/{id}/patterns` | Detail contract must carry repository card, filters, recent commits, pushes, sessions, languages, and top files |
| Sessions | `/sessions` | `sessions.html` | `GET /api/sessions` | none on page | Sessions contract should stay read-only and frontend-facing |
| Achievements | `/achievements` | `achievements.html` | `GET /api/achievements` | none on page | Achievements contract should expose achievements, streaks, and score as one explicit payload |
| Settings | `/settings` | `settings.html` | `GET /api/settings` | `POST /api/settings` | Settings contract must expose config plus resolved paths and return a stable save result |

## Operator action inventory

Manual-first operator actions that both future frontends need:

- add target
- import all repositories
- rescan all repositories
- rebuild analytics
- refresh one repository
- import one repository
- toggle one repository between active and disabled
- remove one repository
- save repository include and exclude patterns
- save settings

Contract expectations for these actions:

- every action returns a stable action result payload with machine-readable action id plus user-facing summary lines
- action responses may include the affected repository, repository card, repository list, or settings payload when helpful
- actions do not move orchestration or validation into the frontend

## Phase 1 backend gaps now addressed

This inventory exists because the pre-migration API had a few risks called out in `BUILD.md`:

- some endpoints returned bare arrays
- some action endpoints returned ad hoc `{ "ok": true }` payloads
- achievements and settings were assembled as handler-local maps instead of named contracts

Phase 1 hardens those endpoints into explicit Go response structs so later frontend work can target stable contracts instead of Python-UI-shaped assumptions.

# GitPulse Frontend Parity Matrix

Purpose: historical inventory from the completed browser cutover. Keep this as a reference for the current shipped UI surface while [BUILD.md](../BUILD.md) now tracks the broader full-stack rewrite.

Current truth as of 2026-03-30:

- the browser cutover to `frontend/web/` is complete
- Go remains the only backend and system of record
- the current codebase still has a shipped `frontend/web` browser surface and a secondary `frontend/tui` preview
- the Bun frontend foundation exists under `frontend/`, including the shared TypeScript contract and shared route and screen maps in `frontend/shared/src/surfaces.ts`
- this document is historical inventory and contract boundary material, not the new rewrite plan

## Historical frontend workspace

Cutover layout used by the current shipped implementation:

```text
frontend/
  shared/
  web/
  tui/
```

Ownership boundary:

- Go owns orchestration, validation, persistence, analytics, and action execution in the current shipped implementation
- frontend code owns rendering, navigation, input state, and presentation-level formatting
- both current frontend surfaces consume the same Go-owned JSON contracts

## Page and workflow parity

| Surface | Legacy browser route | Legacy Python UI files | Go read endpoints | Go action endpoints | Phase 1 contract notes |
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

## Backend gaps addressed during the browser cutover

This inventory existed because the pre-cutover API had a few risks:

- some endpoints returned bare arrays
- some action endpoints returned ad hoc `{ "ok": true }` payloads
- achievements and settings were assembled as handler-local maps instead of named contracts

The browser cutover hardened those endpoints into explicit Go response structs so later frontend work could target stable contracts instead of Python-UI-shaped assumptions.

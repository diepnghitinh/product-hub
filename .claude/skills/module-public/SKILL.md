---
name: module-public
description: Use when working on Public / Share links — unauthenticated, token-based read-only access to a team board, roadmap, project (test reports), or doc, served under /v1/public/* at backend/src/presentation/public and frontend/src/features/public. Related to module-teams, module-roadmaps, module-projects, module-docs, module-reports.
---

# Module: Public / Share links

**Apps/paths:** `backend/src/presentation/public`, `frontend/src/features/public`

## Purpose
Lets a workspace member generate a no-login link so someone outside the tenant (a
stakeholder, a client) can view a single team's board, a roadmap, a project's test
reports, or a doc — read-only. A fifth, unrelated endpoint lets CI/external tooling
*write* a test-case result via an `x-api-key` header instead of a share token.

## Where it lives
- Backend: `presentation/public/public-{teams,roadmaps,projects,docs,testcases}.controller.ts`
  + `public.module.ts` (`PublicPresentationModule`). There is **no** `application/public`
  or `infrastructure/public` — each controller calls a `GetPublic*UseCase` that already
  lives inside the owning module (`application/{teams,roadmaps,projects,docs}/use-cases`),
  and the *toggle-sharing* endpoints (`POST /v1/{teams,roadmaps,docs,projects}/:id/share`)
  live on that owning module's own authed controller, not here.
- Frontend: `features/public/{PublicTeamBoardPage,PublicRoadmapPage,PublicProjectPage,
  PublicDocPage}.tsx` (routed at `/public/{teams,roadmaps,projects,docs}/:token` in
  `App.tsx`, outside the authed app shell), `PublicShell.tsx` (shared read-only chrome:
  slim topbar, "view only" badge, theme toggle), `PublicIssueDialog.tsx` /
  `PublicRoadmapItemDialog.tsx` (read-only detail dialogs), `api.ts` (React Query hooks
  using the shared `apiGet`, which sends no Authorization header when unauthenticated).

## Data model & key fields
Each shareable entity (`TeamEntity`, `RoadmapEntity`, `DocEntity`, `ProjectEntity`)
carries the same pair of props, independently, no shared "Share" entity:
- `publicEnabled: boolean`
- `publicToken: string | null`

`enableSharing(token)` sets both; `disableSharing()` clears both. Tokens are minted by
the caller (`uuid()`, see `SetProjectSharingUseCase`) — not by the entity. Repositories
expose `findByPublicToken(token)` used by every `GetPublic*UseCase`.

## API surface
- `GET /v1/public/teams/:token` — team + `issueType` + that team's issues (bug or task
  list, read from the unified `issues` collection with `userId: ''` so private personal
  cards can't leak onto a shared board).
- `GET /v1/public/teams/:token/items/:itemId/comments` — comments for one card;
  re-verifies the issue belongs to that token's team (`isVisibleTo('', false)`) before
  returning, so a token can't be used to read other items in the same workspace.
- `GET /v1/public/roadmaps/:token` — roadmap with items/columns embedded (one payload).
- `GET /v1/public/projects/:token` — project + its `ReportEntity[]` (test reports).
- `GET /v1/public/docs/:token` — doc + **all** pages with bodies inlined (a shared doc
  is read in one shot, not page-by-page).
- `PATCH /v1/public/testcases/:projectId/:shortId` — sets a test case result, guarded by
  `ApiKeyGuard` (`x-api-key` header, not a share token); every change is audited with
  `AuditActor.API`.

All controllers are `@Public()` (bypass the global JWT guard) except the testcases one,
which instead requires `@UseGuards(ApiKeyGuard)`.

## Relationships to other modules
- [[module-teams]] — team board sharing; toggle lives on `TeamsController`, read here.
- [[module-roadmaps]] — roadmap sharing; items+columns are embedded on the roadmap.
- [[module-projects]] — project sharing exposes its [[module-reports]] test reports.
- [[module-docs]] — doc sharing; whole doc (all pages) returned in one call.
- [[module-issues]] — the team-board endpoint reads/filters the same `issues` collection
  the authed app writes to, so a shared board never lags the live one.
- [[module-activity]] — public comment reads reuse `GetIssueCommentsUseCase`/`CommentMapper`.
- [[module-api-keys]] — `PublicTestcasesController` is the one endpoint in this module
  authenticated by API key rather than a share token.
- [[module-audit-log]] — API-key test-result writes are recorded with an `api` actor.

## Gotchas & conventions
- Public endpoints never accept a JWT; `apiGet` on the frontend simply omits
  `Authorization` when no token is stored, so these pages work for a fully anonymous
  visitor. `retry: false` on every public query hook avoids retry-thrashing a 404 from a
  bad/disabled token.
- Disabling sharing clears `publicToken` entirely (not just `publicEnabled`), so a
  previously-shared link stops resolving rather than merely being hidden.
- The team-board endpoint intentionally passes `userId: ''` to `GetIssuesUseCase` — this
  is what keeps personal (non-team) tasks off a shared board; don't change it to a real
  user id.

## Related skills
[[module-teams]] [[module-roadmaps]] [[module-projects]] [[module-docs]] [[module-reports]] [[module-issues]] [[module-api-keys]] [[module-activity]] [[module-audit-log]]

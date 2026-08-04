---
name: module-projects
description: Use when working on Projects — the "Testing" workspace container (backend/src/{presentation,application,infrastructure}/projects, frontend/src/features/projects) that owns feature reports, groups, and public sharing. Related to module-public, module-tenants, module-auth.
---

# Module: Projects

**Apps/paths:** `backend/src/presentation/projects`, `backend/src/application/projects`, `backend/src/infrastructure/projects`, `frontend/src/features/projects`

## Purpose
A Project is the top-level container in the "Testing" workspace (not the Scrum
issue-tracker side of the app): a tenant creates one Project per initiative
("Checkout Revamp"), sets an `environment` badge (development/staging/production),
and nests **feature reports** (grouped by `groups`, each report holding QA
sections/test-cases) underneath it via `ProjectLayout`'s sidebar. From a Project's
topbar tabs the owner also jumps out to that initiative's Roadmap and Bugs boards
(passed as `?projectId=`), and can flip on a public, read-only share link.

## Where it lives
- Backend: `ProjectsController` (presentation) → 8 use-cases (application) →
  `ProjectRepository` writing the `ProjectDoc` mongoose schema (infrastructure,
  collection driven by `ProjectSchema`, custom `_id` = uuid).
- Frontend: `ProjectLayout.tsx` (full-screen workspace shell: topbar, title-rename
  input, environment badge, Report/Overview/Roadmap/Bugs tabs, share/history/export
  menu), `FeatureSummary.tsx` (overview tab), `components/FeatureSidebar.tsx` (groups
  + reports nav), `components/ProjectCard.tsx` / `ArchivedProjectsPanel.tsx` (project
  list), `components/ProjectFormDialog.tsx` (shared create/edit dialog — title
  required, rest optional), `components/ShareProjectDialog.tsx`,
  `components/EnvironmentBadge.tsx` / `EnvironmentSelect.tsx`, `api.ts` (React Query
  hooks, key root `['projects']`).

## Data model & key fields
`ProjectDoc` / `ProjectProps` (collection driven by `ProjectSchema`, `_id` = uuid v4):
`tenantId`, `slug` (unique per tenant among active rows only — partial index on
`deletedAt: null`), `title`, `subtitle`, `owner` (display label, defaults to
creator's name), `createdBy` (id, drives ownership), `sharedWith: string[]`,
`pinned`, `environment` (enum `Environment`: development/staging/production),
`publicEnabled` + `publicToken` (public read-only link), `deletedAt` (soft-delete/
archive marker), `createdAt`/`updatedAt`.

`ProjectResponseDto` is flat per CLAUDE.md convention — it also inlines Dashboard
rollups (`reportsTotal`, `reportsDone`, `reportsTesting`, `reportsInfo`, `progress`)
computed by `ProjectMapper` from a `ProjectStats` object that is currently always
zero (`ZERO_STATS`) — no use-case wires real report counts in yet.

## API surface
- `GET /projects` — list active projects in tenant (forces `query.archived = false`)
- `GET /projects/archived` — list archived projects (Role ADMIN/PRODUCT; declared
  before `:id` so it isn't swallowed as an id param)
- `POST /projects` — create (Role ADMIN/TESTER/PRODUCT); slug generated via
  `uniqueSlug`, checked against `existsBySlug`
- `GET /projects/:id` — get one
- `PATCH /projects/:id` — update title/subtitle/owner/environment/pin
- `POST /projects/:id/archive` — soft-delete (sets `deletedAt`)
- `POST /projects/:id/restore` — clears `deletedAt`
- `DELETE /projects/:id` — permanent delete (Role ADMIN/PRODUCT)
- `POST /projects/:id/share` — enable/disable the public link (`ShareProjectDto{enabled}`)
- Public read path: `GetPublicProjectUseCase` resolves a `publicToken` into
  `{project, reports}`, served by a separate `presentation/public/public-projects.controller.ts`
  (unauthenticated) — see [[module-public]].

## Relationships to other modules
- **[[module-reports]] / [[module-groups]]** — `FeatureSidebar` and `FeatureSummary`
  consume `useGroups(projectId)` and `useReports(projectId)` from
  `@/features/groups/api` and `@/features/reports/api`; `GetPublicProjectUseCase`
  reaches into `IReportRepository` directly (`findByProject`) to attach reports to
  a public project. These are the feature-report/test-case and sidebar-folder
  sub-entities a Project owns — both nested under `projects/:projectId/...` routes.
- **[[module-roadmaps]] / [[module-bugs]]** — `ProjectLayout`'s topbar tabs
  navigate to `/roadmaps?projectId=...` and `/bugs?projectId=...`, i.e. Projects
  is the scoping context those boards filter by, via query param rather than a
  stored relation.
- **[[module-public]]** — `publicEnabled`/`publicToken` + `GetPublicProjectUseCase`
  back an unauthenticated public share link, served by a separate public-facing
  controller.
- **[[module-cycles]]** — `GetCycleBurndownUseCase` reads each issue's `projectId`
  (`BurndownIssueRow.projectId`) to bucket the burn-up's per-project breakdown
  (`bump(projects, r.projectId, ...)` in `cycle-burndown.ts`) — a Project's id
  surfaces in a team's cycle burndown even though Cycles has no stored relation
  to Projects.
- **[[module-tenants]]** — every read/write is tenant-scoped (`tenantId` on the
  entity, checked in every use-case); slug uniqueness is per-tenant.
- **[[module-auth]]** — `@AuthUser()`/`@Roles()` gate all authenticated endpoints;
  `createdBy`/`owner` come from the JWT payload at creation time.

## Gotchas & conventions
- `GET /projects/archived` must stay registered before `GET /projects/:id` in the
  controller, or Nest would route it as `:id = "archived"`.
- Slug uniqueness only holds among **active** projects (partial Mongo index on
  `deletedAt: null`); an archived project's slug can be reused by a new project.
- Dashboard rollup fields on `ProjectResponseDto` (`reportsTotal`, `progress`, …)
  are always zero today — `ProjectMapper` never receives real `ProjectStats`, this
  is flagged in-code as pending Phase 2 wiring, not a bug.
- `ProjectResponseDto` is intentionally flat (no nested `stats` object) per the
  repo-wide DTO convention in `CLAUDE.md`.
- Frontend title rename is inline/uncontrolled (`ProjectLayout`'s breadcrumb
  `<input>`), keyed by `project.title` so a successful save remounts it — don't
  turn it into a controlled input without re-checking the save-on-blur flow.

## Related skills
[[module-roadmaps]] [[module-bugs]] [[module-public]] [[module-tenants]] [[module-auth]]
[[module-reports]] [[module-groups]]

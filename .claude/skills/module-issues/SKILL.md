---
name: module-issues
description: Use when working on Issues — the unified task/bug entity in backend/src/{presentation,application,infrastructure}/issues and frontend/src/features/issues, the central record everything else foreign-keys into. Related to module-teams, module-cycles, module-roadmaps.
---

# Module: Issues

**Apps/paths:**
`backend/src/presentation/issues`, `backend/src/application/issues`,
`backend/src/infrastructure/issues`, `frontend/src/features/issues`

## Purpose
Issue is the unified, polymorphic record that replaced the separate Task and Bug
concepts: one Mongo collection (`issues`), one API, one entity, told apart by a
`kind` discriminator (`task` | `bug`). It carries every field either kind ever
needed (a flat union), with a neutral default (`''`/`0`) on the fields that don't
apply to that kind — e.g. a bug's `estimate` is `0`, a task's `severity` is `''`.
Almost every other module in the product (teams, cycles, roadmaps, projects,
reports/test-cases, labels, custom fields) links to an issue by id.

## Where it lives
- Backend:
  - Controller: `presentation/issues/issues.controller.ts` (`@Controller()`, mounted
    at `issues` by `presentation.module.ts` → routes are `/v1/issues`)
  - Use-cases: `application/issues/use-cases/` — `create-issue`, `get-issue(s)`,
    `update-issue`, `set-issue-status`, `delete-issue`, plus `resolve-assignees`
    helper
  - Entity/domain: `application/issues/domain/entities/issue.entity.ts` +
    `issue.props.ts` (the `IssueProps` interface), enums in
    `domain/enums/issue.enums.ts`
  - Repository interface: `application/issues/repositories/issue.repository.ts`;
    Mongo impl: `infrastructure/issues/repositories/issue.repository.ts`
  - Mongoose schema: `infrastructure/issues/entities/issue.schema.ts` (collection
    `issues`)
  - DTOs: `application/issues/dtos/{create,update,update-issue-status,query}-issue.dto.ts`,
    `issue.response.dto.ts`; mapper: `application/issues/mappers/issue.mapper.ts`
- Frontend: `features/issues/` — `IssuesPage.tsx` (board/list), `IssueDetailPage.tsx`
  / `IssueDetailMain.tsx` / `IssueDetail.tsx` / `IssuePeekDrawer.tsx` (detail views),
  `IssueTimelineView.tsx`, `IssueRelations.tsx` + `useRelationActions.tsx` +
  `relations.api.ts` (issue-links), `BulkActionBar.tsx` + `bulk.api.ts`,
  `PickIssueDialog.tsx`, `api.ts` (queries/mutations), `hook-factory.ts`
  (`makeIssueHooks` — generates the query hooks), `useIssueSelection.ts`,
  `useIssueCrumb.ts`

## Data model & key fields
Collection `issues`, entity `IssueProps` — flat union of old Task/Bug shapes:
- Identity: `id`, `kind` (`task`|`bug`), `tenantId`, `shortId` (`TSK-7`/`BUG-12`,
  unique per tenant via partial index on `shortId > ''`)
- Linkage: `teamId`, `ownerId` (task-only — private personal task, '' = team
  issue/bug), `parentId` (task-only sub-task), `projectId`, `cycleId`,
  `carryOverCount`, `roadmapId`/`roadmapItemId`/`roadmapItemLabel` (task-only
  backlog link), `caseId`/`caseLabel`/`reportId` (bug-only, links to a test case)
- People: `assignees: {id,name}[]` (ordered, denormalized name), plus deprecated
  mirrors `assigneeId`/`assigneeName` = `assignees[0]` (kept in sync by the entity,
  never set independently — queries `$or` both because pre-multi-assign rows only
  have the mirror); `createdBy`/`createdByName`; `reporterId`/`reporterName`
  (bug-only, mirrors creator)
- Dates/sizing: `startDate`, `endDate` (the deadline board sorts/flags on),
  `dueDate` (task-only deprecated mirror of `endDate`), `estimate` (task-only,
  Fibonacci-ish scale)
- Bug specifics: `severity`, `type`, `attachments: BugAttachment[]`
- Shared meta: `status` (free string — built-in enum key or a team's custom column
  slug), `labelKeys: string[]`, `customFields: Record<string, CustomFieldValue>`,
  `order`, `createdAt`/`updatedAt`, `resolvedAt: Date|null` (stamped/cleared only by
  `IssueEntity.setStatus` crossing the done boundary — never client-settable)
- `IssueKind`: `TASK`/`BUG`. Status/severity/estimate enums are re-exported from
  the legacy `@application/tasks` and `@application/bugs` enum homes (single
  source of truth during migration). `COMPLETED_STATUS_KEYS` per kind
  (bug: resolved/closed; task: done) drives `isCompletedStatus`.
- Indexes: `{tenantId, shortId}` unique partial, `{tenantId, 'assignees.id'}`
  (compound), plus single-field indexes on `kind`, `tenantId`, `teamId`,
  `ownerId`, `parentId`, `roadmapId`, `roadmapItemId`, `projectId`, `cycleId`,
  `assigneeId`, `caseId`, `reportId`, `resolvedAt` (no compound `{tenantId, kind}`
  index).

## API surface
All under `/v1/issues` (`IssuesController`, no path decorator — prefix supplied by
`RouterModule` in `presentation.module.ts`):
- `GET /v1/issues` — list, filters via `QueryIssueDto` (kind, status, severity,
  assigneeId, teamId, mine, personal, ids, parentId, roadmapItemId, roadmapId,
  projectId, cycleId incl. `current`/`upcoming`/`none` sentinels, caseId, reportId,
  createdFrom/To, resolvedFrom/To, `search` — free text over title/description/
  id/shortId, inherited from the shared `PaginationDto`). A team-scoped read
  (`teamId` set) also lazily advances that team's cycles (see Relationships).
- `POST /v1/issues` — create (roles: ADMIN, TESTER, PRODUCT, DEVELOPER)
- `GET /v1/issues/:id` — get one
- `PATCH /v1/issues/:id` — update
- `PATCH /v1/issues/:id/status` — move to another status column
- `DELETE /v1/issues/:id` — delete (deleting a *bug* requires ADMIN/PRODUCT;
  enforced by `canDeleteBug` passed from the controller, task delete is broader)

## Relationships to other modules
- [[module-teams]] — `teamId` scopes an issue to a team's board/list; team
  `status` columns (built-in + custom) are what `status` points at. Team also
  supplies `labels` (source of `labelKeys`) and custom-field defs (source of
  `customFields` keys). `CreateIssueUseCase` also reads `ITeamRepository` for
  the tenant's per-kind `DEFAULT_TEAMS` fallback (`qc`/`engineering`).
- [[module-cycles]] — `cycleId` commits an issue to a team's auto-sprint;
  `carryOverCount` tracks scheduler rollovers between cycles. `CreateIssueUseCase`
  auto-joins a new issue to its landing team's ACTIVE cycle when the team runs
  cycles and no `cycleId` was given; `GetIssuesUseCase` calls
  `CycleSchedulerService.ensureCyclesCurrent`/`resolveCycleFilter` on every
  team-scoped list read (no cron — reads are what advance the cycle clock).
- [[module-roadmaps]] — `roadmapId`/`roadmapItemId`/`roadmapItemLabel` link a task
  to the backlog item it delivers.
- [[module-projects]] — optional `projectId` grouping.
- [[module-reports]] — a bug's `caseId`/`caseLabel`/`reportId` link back to the
  test case / report section it was filed from.
- [[module-issue-links]] — richer typed relations between issues (blocks/relates
  to/etc.), consumed by `IssueRelations.tsx`/`relations.api.ts` on top of this
  entity.
- [[module-users]] — `assignees`, `createdBy`, `reporterId` reference user ids
  with denormalized names.
- [[module-labels]] / [[module-custom-fields]] — `labelKeys` and `customFields`
  values are validated against the owning team's configured labels/fields.
- [[module-webhooks]] — `CreateIssueUseCase` fires `BUG_CREATED`/`BUG_ASSIGNED`
  notifications (best-effort) when a bug is created.
- [[module-my-team]] / [[module-planning]] — team boards, "assigned to me", and
  personal board views all read/filter this same collection.
- [[module-activity]] — `IssueActivityController` is the one comment thread for
  both kinds (`:issueId` = the issue's id); `IssueDetailMain.tsx` mounts
  `CommentThread`/`ActivityHeader` under the description.
- [[module-favourites]] — `FavouriteKind.Issue` covers both kinds; the detail
  header's `FavouriteButton` toggles it.
- [[module-reactions]] — `ReactionBar` mounts under the Description in
  `IssueDetailMain.tsx` for the fixed-emoji quick-reaction bar.
- [[module-docs]] — `LinkedDocsSection` (via `DocLinkRef`/`refId`) shows doc
  pages attached to the issue on its detail view.
- [[module-inbox]] — `GetInboxUseCase` injects `IIssueRepository` as a read-only
  consumer (only calls `findByTenant`, never writes) to compute "assigned bug"
  notifications.

## Gotchas & conventions
- **teamId fallback gotcha** (CLAUDE.md): `CreateIssueUseCase` resolves
  `teamId = dto.personal ? '' : dto.teamId || team?.id.toString() || ''`, where
  `team` is the tenant's **default** team for the kind (QC for bugs, Engineering
  for tasks). **A caller that omits `teamId` doesn't fail — the issue silently
  lands in the wrong team's board**, looking like it saved but not showing up
  where the user was looking. Every board/create-flow must pass its own
  `teamId` explicitly (see `IssueBoardLayout`/`KanbanBoard` conventions in
  CLAUDE.md); routes with no team context (`/bugs`, `/tasks`) rely on this
  fallback intentionally.
- Deprecated mirror fields (`assigneeId`/`assigneeName`, `dueDate`) are
  entity-maintained, never set directly — always go through `assignees`/`endDate`
  and let the entity sync the mirror. Repository assignee filters `$or` across
  `assigneeId` and `assignees.id` to cover pre-multi-assign rows.
  Note: `IssueDoc`/schema define `assigneeId`/`assigneeName` similarly.
- `resolvedAt` is owned entirely by `IssueEntity.setStatus`: first move into a
  completed status stamps it, reopening clears it — never set it from a DTO/client.
- `status` has no enum/validation beyond `IsString` — it can be a built-in key or
  any of a team's custom column slugs, spanning both kinds.
- Per project rule: response DTO (`IssueResponseDto`) is a flat interface, no
  nested sub-objects — mirrored on the frontend `IssueDto`.
- A personal task (`ownerId` set) is always `kind=task` — bugs can never be
  personal; team/assigned list views filter `ownerId: ''` to exclude personal
  tasks from team boards.

## Related skills
[[module-teams]] [[module-cycles]] [[module-roadmaps]] [[module-projects]] [[module-reports]] [[module-issue-links]] [[module-labels]] [[module-custom-fields]] [[module-users]] [[module-webhooks]] [[module-activity]] [[module-favourites]] [[module-reactions]] [[module-docs]] [[module-inbox]]

---
name: module-bugs
description: Use when working on Bugs — the bug-report kind of the unified Issue (severity, attachments, test-case linkage), served through /v1/issues with kind=bug rather than a dedicated /bugs API. Related to module-issues, module-tasks, module-issue-links.
---

# Module: Bugs

**Apps/paths:**
- `backend/src/application/bugs/domain/enums/bug.enums.ts` (only surviving backend "bugs" file — enums only)
- `backend/src/application/issues/**` (real backend home: unified Issue)
- `frontend/src/features/bugs/`

## Purpose
A Bug is a defect report raised against the product: what broke, how severe, optional
screenshots/recordings, and (when it came from testing) a link back to the test case and
report it was found in. Bugs are a Kanban board (`/bugs`, ClickUp-style) with their own
statuses (open → in-progress → blocked → resolved/closed) and severity (low/medium/high/
critical).

## Where it lives
Bugs are **not** a separate backend module — they were migrated into the unified `Issue`
entity. `IssueKind.BUG` is the discriminator field; all persistence, use-cases, and the
`/v1/issues` controller are shared with tasks (see [[module-issues]] for that layer). The
only thing left under a "bugs" path on the backend is
`backend/src/application/bugs/domain/enums/bug.enums.ts`, which defines `BugSeverity`,
`BugStatus`, `BugStatusConfig`, `BugAttachment` and the default status labels/colors —
re-exported (not redefined) from `backend/src/application/issues/domain/enums/issue.enums.ts`.

- Backend: `IssuesController` (`backend/src/presentation/issues/issues.controller.ts`,
  `@Controller()` mounted at `/v1/issues`), `CreateIssueUseCase` / `GetIssuesUseCase` /
  `GetIssueUseCase` / `UpdateIssueUseCase` / `SetIssueStatusUseCase` / `DeleteIssueUseCase`
  under `backend/src/application/issues/use-cases`, single Mongo collection `issues`
  (`backend/src/infrastructure/issues/entities/issue.schema.ts`), one doc per task **or**
  bug told apart by `kind`.
- Frontend: `frontend/src/features/bugs/BugsBoardPage.tsx` (board, list, timeline views via
  `IssueBoardLayout` + `KanbanBoard`), `NewBugPage.tsx`, `BugDetailPage.tsx` (mounted inside
  the generic `/issues/<ref>` detail route, not its own route), `components/BugDetail.tsx`,
  `components/SeverityBadge.tsx`, `bugTemplates.ts` (description templates), and `api.ts`
  which binds `makeIssueHooks` (shared with tasks) to the bug cache namespace
  (`['bugs']`/`['bug']`) and `kind: bug`.

## Data model & key fields
Bugs live in the `issues` collection as `IssueProps` with `kind: 'bug'`
(`backend/src/application/issues/domain/entities/issue.props.ts`). Bug-specific fields
(neutral default on a task):
- `severity: BugSeverity | ''` — low/medium/high/critical
- `type: string` — free-text bug type/category
- `caseId` / `caseLabel` — link to the test-case (report section item) the bug came from
- `reportId` — link to the report/feature the linked case belongs to
- `attachments: BugAttachment[]` — `{ url, name, contentType, size }`, screenshots/short
  recordings in the tenant's configured cloud storage
- `reporterId` / `reporterName` — mirrors `createdBy`/`createdByName` on a bug
- `status: string` — a `BugStatus` built-in (`open|in-progress|blocked|resolved|closed`) or a
  team's custom column key; "finished" = resolved or closed (`COMPLETED_STATUS_KEYS[BUG]`)
- shared fields: `assignees`, `labelKeys`, `customFields`, `teamId`, `cycleId`, `projectId`,
  `startDate`/`endDate`, `order`, `resolvedAt` (stamped on first move into resolved/closed,
  cleared on reopen)
- `shortId` — human reference like `BUG-12`

Frontend `BugDto` (`frontend/src/types/dto`) is a flat subset of the served `IssueDto`.

## API surface
No dedicated `/bugs` endpoint — bugs read/write the unified `/v1/issues` API, filtered by
`kind=bug`:
- `GET /v1/issues` — list; `QueryIssueDto` supports `kind`, `status[]`, `severity[]`,
  `assigneeId[]`, `teamId`, `mine`, `personal`, `projectId[]`, `caseId`, `reportId`, `cycleId`,
  `roadmapItemId`, `search`, `createdFrom/To`, `resolvedFrom/To`
- `POST /v1/issues` — create (roles: ADMIN, TESTER, PRODUCT, DEVELOPER)
- `GET /v1/issues/:id`
- `PATCH /v1/issues/:id` — update
- `PATCH /v1/issues/:id/status` — move column (optimistic on the frontend)
- `DELETE /v1/issues/:id` — deleting a **bug** is admin/product only (tasks are broader);
  enforced via `canDeleteBug` passed into `DeleteIssueUseCase`

## Relationships to other modules
- [[module-issues]] — the real backend/frontend home; Bugs and Tasks are the two `IssueKind`
  values of one unified Issue entity, one collection, one controller, one hook factory
  (`makeIssueHooks`). Read that skill for the shared plumbing.
- [[module-tasks]] — sibling `IssueKind`; shares status "finished" semantics
  (`isCompletedStatus`), assignees, cycles, labels, custom fields.
- [[module-reports]] — `caseId`/`reportId` link a bug back to the test case and report
  (under `/testing/:projectId/reports/:reportId`) it was found from; `BugDetail` renders that
  as a link when both `projectId` and `reportId` are present.
- [[module-issue-links]] — generic issue-to-issue relations also apply to bugs (shared
  `relation-type.enum.ts`), separate from the dedicated `caseId`/`reportId` test-case link.
- [[module-teams]] — a bug's `teamId` scopes it to a team's board/status config
  (`useTeamStatuses`, admin-configurable custom columns beyond the `BugStatus` built-ins);
  `labelKeys`/`customFields` resolve against the team's `labels`/custom fields.
- [[module-cycles]] — a bug can be committed to a team cycle (`cycleId`), carried over
  (`carryOverCount`) if unfinished when the cycle ends.
- [[module-roadmaps]] — indirectly via shared issue plumbing (`roadmapItemId` is task-only,
  not used by bugs).
- [[module-storage]] — `attachments` (screenshots/recordings) are uploaded to the tenant's
  configured cloud storage; the schema mirrors the upload endpoint's response shape.
- [[module-activity]] — comments on a bug use the same `issue-comment.use-cases.ts` as any
  issue.
- [[module-webhooks]] — `CreateIssueUseCase` fires `WebhookEvent.BUG_CREATED` (and
  `BUG_ASSIGNED` when created with an assignee) best-effort on bug creation, notifying the
  tenant's configured Lark/Telegram webhooks; task creation never fires these.
- [[module-custom-fields]] — `BugDetail` renders `<CustomFields fields={teamCustomFields}
  values={bug.customFields ?? {}} onChange=... />` in the Properties sidebar, same pattern as
  tasks/issues.
- [[module-my-team]] — a bug team's workload view works the same way as a task team's, filtered
  by `kind: IssueKind.BUG`; unlike tasks it has no story-point estimate rollup and no `DONE`
  built-in, falling back to the board's last column (`doneKeyOf`) as "complete".
- [[module-inbox]] — bugs assigned to a user surface in Inbox's "assigned" section
  (`GetInboxUseCase` queries issues with `kind: [IssueKind.BUG]` + `assigneeId`), and
  `InboxPage` renders the selected bug via the shared `<BugDetail>` component.

## Gotchas & conventions
- Never build a separate "bugs" backend module — the `bugs` folder under `application/` is
  legacy enum-only; all new logic belongs in `application/issues`.
- `severity` is `''` (not a valid `BugSeverity`) on a task; always check kind before reading
  bug-only fields.
- `reporterId`/`reporterName` mirror `createdBy`/`createdByName` on a bug — don't treat them
  as independently settable.
- Deleting a bug requires ADMIN or PRODUCT role — stricter than the general issue-write role
  set (ADMIN/TESTER/PRODUCT/DEVELOPER).
- Bug boards must follow the shared Kanban layout rules in the repo's root `CLAUDE.md`
  ("Kanban board layout" section): compose `IssueBoardLayout` + `KanbanBoard`, never
  hand-roll board chrome, always pass the board's `teamId` when creating.
- `resolvedAt` is owned entirely by `IssueEntity.setStatus`; a client can never set/backdate
  it — first move into resolved/closed stamps it, reopening clears it.

## Related skills
[[module-issues]] [[module-tasks]] [[module-issue-links]] [[module-teams]] [[module-cycles]] [[module-reports]] [[module-storage]] [[module-activity]] [[module-webhooks]] [[module-custom-fields]] [[module-my-team]] [[module-inbox]]

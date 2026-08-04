---
name: module-tasks
description: Use when working on Tasks — the `kind: task` half of the unified issues collection, its per-user Personal board, and the My Tasks board. Related: [[module-issues]], [[module-teams]], [[module-roadmaps]].
---

# Module: Tasks

**Apps/paths:**
- `backend/src/application/tasks/domain/enums/task.enums.ts` (only backend file left under `tasks/` — no controller/repository)
- `backend/src/application/issues/**`, `backend/src/infrastructure/issues/**`, `backend/src/presentation/issues/issues.controller.ts` (the shared unified-issue stack)
- `backend/src/application/users/**` (personal-board columns)
- `frontend/src/features/tasks/**`

## Purpose
A Task is engineering/product work tracked to done, sized on a Fibonacci-ish estimate scale, and optionally linked to a roadmap backlog item or broken into sub-tasks. Tasks power a team's task board, the cross-team "My Tasks" queue, and each user's private Personal board.

## Where it lives
- Backend: **there is no `/tasks` controller or repository anymore.** Tasks are one `kind` of the unified issue — `IssuesController` (`backend/src/presentation/issues/issues.controller.ts`) is described in its own header comment as "Replaces the separate /tasks and /bugs controllers." All task reads/writes go through `application/issues` use-cases and `infrastructure/issues` (Mongoose `issues` collection). The only surviving `tasks/` code is the enum/constants file (`TaskStatus`, `TASK_STATUSES`, `TaskStatusConfig`, `TaskLabelConfig`, `TASK_ESTIMATE_VALUES`).
- Personal-board columns are on the **users** module, not issues: `application/users/dtos/personal-statuses.dto.ts`, `use-cases/get-personal-statuses.use-case.ts` / `replace-personal-statuses.use-case.ts`, exposed at `GET/PUT /users/me/personal-statuses` in `presentation/users/users.controller.ts`. Stored as `TaskStatusConfig[]` on `UserEntity.personalStatuses`.
- Frontend: `features/tasks/api.ts` (hooks), `MyTasksPage.tsx` (team/cross-team kanban+list), `PersonalBoardPage.tsx` (private board), `MyTaskListView.tsx` (flat "Today"/"Personal" list sub-views), `TaskDetailPage.tsx` / `components/TaskDetail.tsx`, `NewTaskPage.tsx`, `components/SubtaskSection.tsx`, `components/PickTaskDialog.tsx`, `components/PersonalColumnsDialog.tsx`, `components/TaskComposerCard.tsx`, `components/TaskPanel.tsx`.

## Data model & key fields
Tasks and bugs share one Mongo collection, **`issues`** (`infrastructure/issues/entities/issue.schema.ts`), discriminated by `kind: IssueKind.TASK | IssueKind.BUG`. `IssueProps` is a flat union; fields marked TASK-only carry a neutral default (`''`/`0`) on a bug:
- `kind`, `tenantId`, `teamId`, `shortId` (e.g. `TSK-7`), `title`, `description`, `status` (a `TaskStatus` value or a tenant custom column key)
- **`ownerId`** — TASK-only. Set = a private *personal* task (no team), visible only to the owner + admins. `''` for team tasks and every bug. All team/assigned queries filter `ownerId: ''`.
- **`parentId`** — TASK-only. Non-empty = a sub-task.
- `roadmapId` / `roadmapItemId` / `roadmapItemLabel` — TASK-only link to a roadmap backlog item.
- `projectId`, `cycleId`, `carryOverCount`
- `assignees: IssueAssignee[]` (ordered, denormalized name) plus deprecated mirrors `assigneeId`/`assigneeName` (kept in sync, still read by the Mongo index/MCP/webhooks)
- `startDate`/`endDate` (ISO `YYYY-MM-DD`, `''` = unset), deprecated `dueDate` mirror of `endDate`, `estimate` (`TASK_ESTIMATE_VALUES = [0,1,2,3,5,8,13,21]`, `0` = unset)
- `labelKeys: string[]`, `customFields: Record<string, CustomFieldValue>`, `order`, `resolvedAt` (stamped only by `IssueEntity.setStatus` on first entry into `TaskStatus.DONE`, cleared on reopen)
- Bug-only fields (`severity`, `type`, `caseId`/`caseLabel`, `reportId`, `attachments`, `reporterId`/`reporterName`) are `''`/`[]` on a task.
- Unique index `{ tenantId, shortId }` (partial, `shortId > ''`) — TSK/BUG shortIds never collide.
- `TaskStatus`: `todo` / `in-progress` / `done`. `TaskStatusConfig { key, label, color }` — same shape used both for a team's task columns (`TeamStatusConfig`) and a user's personal-board columns.

## API surface
All under the unified `/issues` prefix (`IssuesController`) — no `kind` in the path, `kind: 'task'` is a query/body field:
- `GET /issues` — list, filters incl. `kind`, `teamId`, `status`, `assigneeId`, `mine`, `personal`, `parentId`, `roadmapItemId`, `roadmapId`, `projectId`, `cycleId`, `search`
- `POST /issues` — create (Roles: ADMIN/TESTER/PRODUCT/DEVELOPER)
- `GET /issues/:id` — also accepts a shortId ref
- `PATCH /issues/:id` — update
- `PATCH /issues/:id/status` — move column
- `DELETE /issues/:id` — tasks deletable by broader board-write roles; bug delete stays admin/product-only (`canDeleteBug`)

Personal-board columns (`presentation/users/users.controller.ts`):
- `GET /users/me/personal-statuses` — caller's own columns
- `PUT /users/me/personal-statuses` — replace (add/rename/recolour/reorder/remove)

Frontend never calls a `/tasks/*` path — `features/tasks/api.ts` binds `makeIssueHooks<TaskDto, …>({ listKey: 'tasks', detailKey: 'task', kind: IssueKind.TASK })` against `/issues`, per its own header comment: *"Tasks read/write the unified `/issues` collection … not the retired `/tasks` endpoint."*

## Relationships to other modules
- **[[module-issues]]** — the parent abstraction. Tasks are one `kind` of issue; all CRUD, status-move, and optimistic-cache logic (`makeIssueHooks`) is shared with bugs. Read that skill for the mechanics this one only binds.
- **[[module-teams]]** — a team task's board columns are `TeamStatusConfig` read via `useTeamStatuses(teamId, TeamIssueType.TASK)`, owned by Settings → Teams (`AdminSettingsPage`/`useUpdateTeamStatuses`), per the Kanban board layout rule in CLAUDE.md ("A board never adds a column"). A team also owns the `labelKeys` vocabulary a task can carry.
- **[[module-roadmaps]]** — `roadmapId`/`roadmapItemId`/`roadmapItemLabel` link a task to a backlog item; `PickTaskDialog` and `SubtaskSection`'s "link existing" resolve/write this link; `issueRefsInText`/`useLinkIssuesByRef` auto-link `TSK-…`/`BUG-…` refs pasted into an item's description.
- **[[module-cycles]]** — `cycleId` commits a task to a team's current/upcoming sprint; `carryOverCount` tracks auto-carry when unfinished at cycle close.
- **[[module-bugs]]** — sibling `kind` in the same collection; `SubtaskSection`/`PickTaskDialog` treat both as interchangeable "issues" (a bug can block/deliver a roadmap item too).
- **[[module-issue-links]]** — `TaskDetail.tsx` wires `IssueRelations`/`useRelationActions`/`PickIssueDialog` (all from `features/issues/`) straight into the task detail sidebar for typed relations ("blocks", "parent of", …) to any other task or bug.
- **[[module-users]]** — owns `personalStatuses` on `UserEntity` and the `/users/me/personal-statuses` endpoints backing the Personal board; `ownerId` on a task points back to a user.
- **[[module-custom-fields]]** — `customFields` values are keyed by a team's custom-field ids (`CustomFieldValue` from `application/teams/domain/enums/custom-field.enums`).
- **[[module-labels]]** — `labelKeys` reference a team's label config; resolved per-card in `MyTasksPage` via `useTeamLabelsLookup` since the cross-team board spans multiple teams' label sets.
- **[[module-my-team]]** — the "All teams" workload view is task-only, built from `useIssues({ kind: [IssueKind.TASK] })` (`MyTeamPage.tsx`'s `isAllTeams` branch); its progress rollup (`workload.ts`'s `doneKeyOf`) treats `TaskStatus.DONE` as the completion column.

## Gotchas & conventions
- Never add a `/tasks` backend route — the module was deliberately merged into `/issues`; even the frontend keeps `useTasks`/`useCreateTask` names only as a binding layer over `makeIssueHooks`.
- Creating a task **must** send `teamId` from the board it was opened on — omitting it silently files into the workspace's default task team (see CLAUDE.md Kanban rule and `CreateTaskInput.teamId` doc comment).
- `personal: true` in `CreateTaskInput`/`TaskQuery` is the only way in/out of a Personal board; owner always comes from the JWT, never a param, so personal tasks can't leak into team/assigned views (`ownerId: ''` filter) or be spoofed cross-user.
- Personal-board columns have no Settings page — managed per-user via `PersonalColumnsDialog` (⋯ → Manage columns), not by an admin.
- `dueDate` and `assigneeId`/`assigneeName` are deprecated mirrors kept in sync by the entity — write `endDate`/`assignees`, but repository assignee filters still `$or` both because pre-multi-assign rows only have the mirror.
- `resolvedAt` is entity-owned (`IssueEntity.setStatus`) — never set/backdate it from a client.

## Related skills
[[module-issues]] [[module-teams]] [[module-roadmaps]] [[module-cycles]] [[module-bugs]] [[module-users]] [[module-custom-fields]] [[module-labels]] [[module-issue-links]] [[module-my-team]]

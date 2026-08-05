---
name: module-teams
description: Use when working on Teams — the workspace's unit of ownership over one issue list (bug or task), its board columns/labels/custom fields, and cycle rhythm; backend/src/{presentation,application,infrastructure}/teams, frontend/src/features/teams. Read by every Kanban board ([[module-bugs]], [[module-tasks]]) and by [[module-cycles]] for its rhythm config.
---

# Module: Teams

**Apps/paths:** `backend/src/presentation/teams`, `backend/src/application/teams`, `backend/src/infrastructure/teams`, `frontend/src/features/teams`

## Purpose
A team owns exactly one issue list — bugs or tasks — and everything that list's board needs to render: its board columns (statuses), its shared item labels, its shared custom fields, and its cycle (sprint) rhythm. Every workspace is seeded with two teams it can never lose: `qc` (bug list) and `engineering` (task list); a tenant can add more teams of either issue type. A team can also expose its board as a public read-only link.

## Where it lives
- Backend: `presentation/teams/teams.controller.ts` (CRUD + statuses/labels/custom-fields/share), `presentation/teams/team-cycles.controller.ts` (cycles nested under `/teams/:teamId/cycles`); use-cases in `application/teams/use-cases/team.use-cases.ts`; entity `application/teams/domain/entities/team.entity.ts` (+`.props.ts`); enums in `application/teams/domain/enums/{team,custom-field,team-icons}.enums.ts`; Mongoose schema `infrastructure/teams/entities/team.schema.ts`.
- Frontend: `features/teams/api.ts` (all team queries/mutations + the status/label/custom-field lookup hooks), `TeamBoardPage.tsx` (resolves `:teamId` and renders `BugsBoardPage` or `MyTasksPage` scoped to it), `TeamIconPicker.tsx`, `TeamShareMenu.tsx`, `CreateTeamDialog.tsx`.

## Data model & key fields
Mongo collection `teams` (`TeamDoc`, unique index `{tenantId, key}`):
`key` (stable per-tenant slug), `name`, `issueType` (`bug`|`task`, fixed at creation), `icon`, `color` (nullable — inherits when null), `statuses?: TeamStatusConfig[]` (`{key,label,color}`, optional — undefined means "never configured", resolves to `defaultStatusesFor(issueType)`), `labels?: TaskLabelConfig[]` (`{key,name,color}`, no built-ins, empty is valid), `customFields?: CustomFieldConfig[]` (stored as `Schema.Types.Mixed` because fields include Mongoose-reserved keys `type`/`required`), `cyclesEnabled`, `cycleMode` (`auto`|`manual`), `cycleLengthWeeks`, `cycleCooldownWeeks`, `cycleStartDay`, `cycleStartDate`, `cycleAutoRollover`, `archived`, `order`, `publicEnabled`, `publicToken`.
`TeamResponseDto` is flat (CLAUDE.md convention) and adds `isDefault: boolean` (true for the seeded `qc`/`engineering` teams — locked from archiving).

## API surface
All under `/v1/teams` (RouterModule path `teams`):
- `GET /teams` — list (any authenticated user, drives the nav)
- `POST /teams` — create (admin/product)
- `PATCH /teams/:id` — rename/archive/icon/color (admin/product; defaults can't be archived)
- `PUT /teams/:id/statuses` — replace board columns (admin/product; built-ins can be renamed/reordered, not removed)
- `PUT /teams/:id/labels` — replace item labels (admin/product; empty clears)
- `PUT /teams/:id/custom-fields` — replace custom fields (admin/product; empty clears)
- `POST /teams/:id/share` — toggle public read-only link (admin/product)
- `GET /teams/:teamId/cycles`, `GET /teams/:teamId/cycles/:cycleId/burndown`, `POST/PATCH/DELETE /teams/:teamId/cycles(/:cycleId)`, `PATCH /teams/:teamId/cycle-config` — cycle endpoints nested under teams (`team-cycles.controller.ts`)

## Relationships to other modules
- [[module-bugs]] / [[module-tasks]] — a team owns exactly one of these lists (`issueType`); `TeamBoardPage` renders `BugsBoardPage` or `MyTasksPage` scoped by `teamId`. Every board (`KanbanBoard`/`IssueBoardLayout`) reads its columns from `team.statuses`, never hardcodes them.
- [[module-cycles]] — `cyclesEnabled`/`cycleMode`/rhythm fields live on the team; `team-cycles.controller.ts` and `UpdateTeamCycleConfigUseCase` mint/manage cycles per team.
- [[module-labels]] / [[module-custom-fields]] — a team's `labels` and `customFields` are shared by every task/bug in that team; edited via `PUT /teams/:id/labels` and `/custom-fields`.
- [[module-admin]] — `AdminSettingsPage` (Settings → sidebar → Teams → settings) is the one place statuses/labels/custom fields are edited, via `useUpdateTeamStatuses` and siblings in `features/teams/api.ts`.
- [[module-roadmaps]] — reuses the same `TEAM_COLORS` palette for its own columns so the workspace never sprouts off-brand colours (roadmap columns are edited separately, not team statuses).
- [[module-public]] — `GetPublicTeamUseCase` resolves a `publicToken` into a read-only team for the shared board link.
- [[module-my-team]] — the workload view isn't a `KanbanBoard` but still reads `useTeams`/`useTeamStatuses` to bucket each person's issues by `TeamStatusConfig` column and to find the board's terminal "done" key.
- [[module-platform]] / [[module-tenants]] — `CreateTenantUseCase` (vendor-console tenant creation) injects `EnsureDefaultTeamsUseCase` and calls it right after `tenants.save(tenant)`, seeding the same `qc`/`engineering` default teams synchronously, not just via the self-serve registration/boot backfill path.
- [[module-mcp]] — `GetMcpContextUseCase` and `McpCreateIssueUseCase` call `GetTeamsUseCase` and pass the result into `resolveTeam`/`resolveStatus` to match the `create_issue`/`list_workspace` tool args' team/status names, erroring with the valid choices when a name doesn't match.

## Gotchas & conventions
- **Default team is the `teamId` fallback target.** `useTeamStatusesLookup` in `features/teams/api.ts`: when `teamId` is absent it falls back to `teams.find(t => t.issueType === issueType && t.isDefault)`, then to code defaults — this is what powers the team-less `/bugs` and `/tasks` routes. A board's create action must always pass its own `teamId`, or the item silently lands on the default team (see Kanban board layout rules in CLAUDE.md).
- Built-in status keys (`builtinStatusKeys(issueType)`, sourced from `DEFAULT_BUG_STATUSES`/`DEFAULT_TASK_STATUSES`) can be renamed/recoloured/reordered but `setStatuses` on the entity rejects a payload missing any of them — rollups (`open bugs = not resolved/closed`, "N of M done") read these keys literally.
- `statuses`/`labels`/`customFields` are optional on the schema (`default: undefined`) specifically so the boot migration can distinguish "never configured" from "configured to exactly the defaults."
- The two seeded teams (`qc`, `engineering`) are found/created idempotently by `EnsureDefaultTeamsUseCase` (registration, boot backfill, and platform-console `CreateTenantUseCase`); `key` is their stable identity, `name` is editable, `archived` is blocked (`TEAM_DEFAULT_LOCKED`).
- `color` may be `null` (inherits surrounding colour) — `UpdateTeamDto.color` explicitly allows `null` via `ValidateIf` to distinguish "unset" from "omitted."
- Per CLAUDE.md: API DTOs are flat, no nested response interfaces.

## Related skills
[[module-bugs]] [[module-tasks]] [[module-cycles]] [[module-labels]] [[module-custom-fields]] [[module-admin]] [[module-roadmaps]] [[module-public]] [[module-my-team]] [[module-platform]] [[module-tenants]] [[module-mcp]]

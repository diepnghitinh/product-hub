---
name: module-labels
description: Use when working on Labels — the per-team, no-built-ins tag set (`team.labels`) that tasks/bugs reference via `issue.labelKeys`, rendered by frontend/src/features/labels/LabelChips.tsx and edited in Settings → Teams. Related to module-teams, module-tasks, module-bugs.
---

# Module: Labels

**Apps/paths:** `frontend/src/features/labels` (`LabelChips.tsx`); no dedicated backend module — labels are a field on Team.

## Purpose
Labels are free-form, colour-tagged pills a workspace defines per team (e.g. "frontend", "P1") and applies to that team's tasks/bugs. There are no built-in labels and no global label list — each team owns its own set, and an empty set is valid. Every board, card, and detail view renders the same tinted-pill chip via one shared component.

## Where it lives
- Backend: no `labels` module. Labels are a field on `Team` — see `backend/src/application/teams/domain/entities/team.props.ts` (`labels?: TaskLabelConfig[]`), mutated by `team.setLabels()` in `backend/src/application/teams/domain/entities/team.entity.ts` and the `UpdateTeamLabels` use-case in `backend/src/application/teams/use-cases/team.use-cases.ts`. Exposed at `PUT /v1/teams/:id/labels` (`backend/src/presentation/teams/teams.controller.ts`, `Role.ADMIN`/`Role.PRODUCT` only) taking `UpdateTeamLabelsDto { labels: TeamLabelDto[] }`. Persisted on `TeamSchema.labels` as an untyped `{key, name, color}` subdoc array (`backend/src/infrastructure/teams/entities/team.schema.ts`), typed via `TaskLabelConfig` from `@application/tasks/domain/enums/task.enums`.
- Frontend: `frontend/src/features/labels/LabelChips.tsx` exports `resolveLabels(keys, labels)` (filters+orders an item's `labelKeys` against the team's label list, team order wins) and `LabelChips` (the read-only tinted-pill row, with `max`+"+N" overflow). Editing lives in `frontend/src/features/admin/AdminSettingsPage.tsx`'s `TeamLabelsEditor` (per-team labels editor under Settings → Teams). Picking labels on an item uses a plain `MultiSelect` inline in `TaskDetail.tsx`/`BugDetail.tsx` (no dedicated picker component). Data access: `useTeamLabels(teamId)` / `useTeamLabelsLookup()` and the mutation `useUpdateTeamLabels()` in `frontend/src/features/teams/api.ts`.

## Data model & key fields
`TaskLabelConfig` (`frontend/src/types/enums.ts`, mirrored backend `@application/tasks/domain/enums/task.enums`):
- `key` — stable slug stored on issues; immutable identity even if name/colour change
- `name` — editable display name
- `color` — hex, used both as pill text colour and `color-mix(...,14%,transparent)` background tint

Stored on `Team.labels?: TaskLabelConfig[]` (collection `teams`, field `labels`, `default: undefined` — absent/empty both mean no labels). Referenced on the Issue side by `issue.labelKeys: string[]` (`backend/src/infrastructure/issues/entities/issue.schema.ts` field `labelKeys`, `default: []`) — just an array of `key` strings, no FK enforcement; a key with no matching label (team deleted it) silently drops out of `resolveLabels`.

## API surface
- `PUT /v1/teams/:id/labels` — replace a team's full label list (`{ labels: TeamLabelDto[] }` → `TeamResponseDto`), `Role.ADMIN`/`Role.PRODUCT`. No per-label CRUD endpoint; the client always sends the whole array.
- Issue labelKeys are set through the normal issue update path, not a labels endpoint: `PATCH` issue with `labelKeys?: string[]` (`update-issue.dto.ts`, `update-issue.use-case.ts`).

## Relationships to other modules
- [[module-teams]] — labels are literally a `Team` field, edited only from Settings → Teams (`TeamLabelsEditor`), exactly like statuses and custom fields. No standalone "Labels" admin page.
- [[module-tasks]] and [[module-bugs]] — both `kind`s of the unified Issue carry `labelKeys: string[]`; `TaskDetail.tsx` and `BugDetail.tsx` both resolve+edit them via the shared `LabelChips`/`resolveLabels` + inline `MultiSelect`, and both boards' cards render `<LabelChips keys={item.labelKeys} labels={labels} />`.
- [[module-issues]] — `labelKeys` lives on the shared Issue entity/schema/DTOs (`issue.props.ts`, `issue.schema.ts`, `issue.response.dto.ts`), so the field is generic to tasks and bugs alike, not duplicated per kind.
- [[module-cycles]] — sprint burndown groups work by `labelKeys` (`cycle-burndown.ts`), so a cycle's velocity/burndown breakdown can slice by label.

## Gotchas & conventions
- No built-ins, no global/tenant-wide label list — every team's `labels` array is independent; a "frontend" label in one team is unrelated to one of the same name in another.
- `labelKeys` on an issue is just strings; deleting a label from the team doesn't touch existing issues' `labelKeys` — `resolveLabels` is what makes stale keys disappear from the UI rather than a backend cleanup job.
- Chip order always follows the team's label order, not the item's `labelKeys` order — keeps chip order consistent across cards/rows/detail regardless of pick order.
- `LabelChips` renders a `<span>`, not `<div>`, specifically so it nests inside list rows' `<button>`/`<a>` wrappers.

## Related skills
[[module-teams]] [[module-tasks]] [[module-bugs]] [[module-issues]] [[module-cycles]]

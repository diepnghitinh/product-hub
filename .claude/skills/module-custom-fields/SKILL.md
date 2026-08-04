---
name: module-custom-fields
description: Use when working on Custom Fields — team-defined property rows (text/number/select/date/checkbox) rendered in the issue Properties sidebar and stored on issue.customFields (Mixed), at frontend/src/features/custom-fields/CustomFields.tsx. Related to module-teams (owns the field definitions), module-issues/module-bugs/module-tasks (store the values).
---

# Module: Custom Fields

**Apps/paths:** `frontend/src/features/custom-fields/CustomFields.tsx` (frontend rendering only — no dedicated backend module; definitions live on Team, values live on Issue)

## Purpose
Lets a team define its own Jira/ClickUp-style fields (e.g. "Environment", "Story Points") that show up as extra property rows on every bug/task that team owns. Field *definitions* (name, type, options, required) belong to the team; field *values* are per-issue and free-form. Renders nothing when the team has defined no fields.

## Where it lives
- Backend: no `custom-fields` module of its own. Definitions are a sub-resource of Team (`backend/src/application/teams/domain/enums/custom-field.enums.ts`, `team.props.ts` field `customFields?: CustomFieldConfig[]`, `PUT /v1/teams/:id/custom-fields` in `backend/src/presentation/teams/teams.controller.ts`). Values live on Issue (`backend/src/application/issues/domain/entities/issue.props.ts` field `customFields: Record<string, CustomFieldValue>`; Mongoose `Schema.Types.Mixed` in `backend/src/infrastructure/issues/entities/issue.schema.ts`; also in `update-issue.dto.ts` / `issue.response.dto.ts`).
- Frontend: single component `CustomFields.tsx` (exports `CustomFields`, plus internal `FieldControl`/`FieldValueDisplay`), consumed from `frontend/src/features/bugs/components/BugDetail.tsx` and `frontend/src/features/tasks/components/TaskDetail.tsx`. Definitions are edited in `frontend/src/features/admin/AdminSettingsPage.tsx` (`CustomFieldsEditor`, under Settings → Teams → team settings) via `useUpdateTeamCustomFields()` / `useTeamCustomFields()` in `frontend/src/features/teams/api.ts`. Shared types in `frontend/src/types/enums.ts`.

## Data model & key fields
- `CustomFieldType` enum: `text | number | select | date | checkbox` (mirrored FE/BE).
- `CustomFieldConfig` (on `Team.customFields[]`): `{ id, name, type, options?: string[], required? }`. `id` is the stable key stored in each issue's value map; `options` only meaningful for `select`.
- `CustomFieldValue = string | number | boolean` — dates are stored as ISO `YYYY-MM-DD` strings.
- Issue values: `Issue.customFields: Record<string, CustomFieldValue>` — an unset/empty field simply has its key dropped rather than storing `null`/`''`. Stored as Mongoose `Mixed` on the `issues` collection.

## API surface
- `PUT /v1/teams/:id/custom-fields` — replaces the team's full field list (`UpdateTeamCustomFieldsDto`, empty array clears them).
- Team read DTO includes `customFields: CustomFieldDto[]`.
- Issue values travel inline as part of the normal issue update/response payloads (`PATCH` issue with `customFields` in `update-issue.dto.ts`; returned in `issue.response.dto.ts`) — there is no dedicated custom-field-value endpoint.

## Relationships to other modules
- [[module-teams]] owns the field *definitions*: `CustomFieldConfig[]` lives on `Team.customFields`, edited from Settings → Teams (same place that owns board statuses/labels), read everywhere via `useTeamCustomFields(teamId)`.
- [[module-bugs]] and [[module-tasks]] are the only consumers: both `BugDetail` and `TaskDetail` render `<CustomFields fields={teamCustomFields} values={issue.customFields ?? {}} onChange={(next) => save({ customFields: next })}>` as extra `PropField` rows in the Properties sidebar (`PropField` from `frontend/src/features/issues/IssueDetail`).
- [[module-issues]]: the storage field (`customFields: Record<string, CustomFieldValue>`) is defined once on the shared Issue entity/schema/DTOs that bugs and tasks both are.

## Gotchas & conventions
- `TeamEntity.setCustomFields()` (`team.entity.ts`) validates the whole list server-side on every `PUT .../custom-fields`: rejects duplicate `id`s, blank `name`s, and unknown `type`s outright; a `select` field additionally must have at least one non-empty, de-duplicated `options` entry or the whole request fails. There is no cap on the number of fields.
- A field is "missing" (shows the required-value error) only if `field.required` and the value is empty — for `checkbox` that means "required and not `true`" (an unchecked-but-optional box is not missing).
- Read-only mode (`canWrite=false`) renders `FieldValueDisplay` instead of an input; checkbox shows yes/no text, everything else shows `—` when empty or `String(value)` otherwise.
- Setting a value to `undefined` or `''` deletes that key from the values map rather than storing an empty value — keeps the stored `customFields` map sparse.
- Field `id` (e.g. `field-3` from the admin editor's auto-increment) is a stable slug — renaming a field's `name` does not orphan already-stored values, but deleting/reusing an `id` would.
- Icon-per-type mapping (`fieldIcon`) and the type→control mapping (`FieldControl`) must stay in sync whenever `CustomFieldType` gains a new variant.

## Related skills
[[module-teams]] [[module-bugs]] [[module-tasks]] [[module-issues]]

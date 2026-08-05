---
name: module-groups
description: Use when working on Groups — the admin-managed sidebar folders (`projects/:projectId/groups`) that organize a project's feature Reports, backend backend/src/{presentation,application,infrastructure}/groups and frontend/src/features/groups. Related: module-reports, module-projects.
---

# Module: Groups

**Apps/paths:** `backend/src/presentation/groups`, `backend/src/application/groups`, `backend/src/infrastructure/groups`, `frontend/src/features/groups`

## Purpose
Groups are ordered, admin-named folders scoped to one project (e.g. "1 · Authentication") used to bucket that project's feature Reports in the project sidebar (`FeatureSidebar.tsx`) and in the project Overview's "by group" rollup (`FeatureSummary.tsx`). Reports without a matching `groupId` render under an "ungrouped" bucket. There is no nested tree — groups are a single flat, orderable list per project.

## Where it lives
- Backend: `GroupsController` (`presentation/groups/groups.controller.ts`) → use-cases in `application/groups/use-cases/` (`CreateGroupUseCase`, `GetGroupsUseCase`, `UpdateGroupUseCase`, `ReorderGroupsUseCase`, `DeleteGroupUseCase`) → `IGroupRepository` → Mongoose repo/schema in `infrastructure/groups/`. Domain: `GroupEntity`/`GroupProps` in `application/groups/domain/entities/`.
- Frontend: `frontend/src/features/groups/api.ts` (`useGroups`, `useCreateGroup`, `useUpdateGroup`, `useReorderGroups`, `useDeleteGroup`). Consumed by `frontend/src/features/projects/components/FeatureSidebar.tsx` (create/rename/delete/drag-reorder groups, drag a report onto a group to re-assign it) and `frontend/src/features/projects/FeatureSummary.tsx` (read-only "features by group" section).

## Data model & key fields
Mongo collection backing `GroupSchema` (`infrastructure/groups/entities/group.schema.ts`), fields: `_id` (uuid string), `tenantId`, `projectId`, `slug`, `title` (max 160), `order` (number, ascending sidebar position), `createdAt`/`updatedAt`. Unique index on `{ tenantId, projectId, slug }` — slug is unique per project, generated via `uniqueSlug(title, ...)` at creation, not user-settable. `GroupResponseDto` mirrors these fields flat (per CLAUDE.md convention). Frontend `GroupDto` (`frontend/src/types/dto.ts`) matches exactly (dates as strings).

## API surface
All routes under `/v1/projects/:projectId/groups`, tenant-scoped via `auth.tenantId`, mutation routes gated `@Roles(ADMIN, TESTER, PRODUCT, DEVELOPER)`:
- `GET /` — list a project's groups, ordered
- `POST /` — create (`CreateGroupDto { title }`), auto-assigns `order = countByProject(...)` (appends to end) and a unique slug
- `POST /reorder` — bulk reorder (`ReorderGroupsDto { ids: string[] }`); registered before `:id` to avoid route capture
- `PATCH /:id` — rename (`UpdateGroupDto`)
- `DELETE /:id` — remove a group

## Relationships to other modules
- [[module-reports]] — Reports carry a `groupId` field; Groups are purely the organizing folder for a project's Reports (feature test-case coverage). The sidebar's drag-and-drop reassigns a Report's `groupId`, not anything on Group itself.
- [[module-projects]] — Groups are always scoped by `projectId` (nested route) and `CreateGroupUseCase` validates the parent project exists and belongs to the caller's tenant before creating.

## Gotchas & conventions
- The controller doc comment on `DELETE :id` says "Remove a group and its features," but `DeleteGroupUseCase` only deletes the `Group` document itself — it does not cascade-delete or reassign the Reports that referenced it via `groupId` (verify current behavior in the frontend's `ungrouped` fallback, which is what makes orphaned Reports still visible after a group delete).
- `slug` is server-derived (uniqueness enforced per project) — never settable via `CreateGroupDto`/`UpdateGroupDto`, both of which only expose `title`.
- `/reorder` must stay registered ahead of `/:id` in the controller or Nest will route `reorder` as an `:id` param.
- Frontend query key is `['groups', projectId]`; every mutation invalidates it (no optimistic updates).

## Related skills
[[module-reports]] [[module-projects]]

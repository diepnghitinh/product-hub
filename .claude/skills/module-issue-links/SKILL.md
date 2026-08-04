---
name: module-issue-links
description: Use when working on Issue Links — typed relations (blocks, parent-of, related-to, duplicate-of) between two issues, rendered in the task/bug detail sidebar. Relates closely to module-issues, module-bugs, module-tasks.
---

# Module: Issue Links

**Apps/paths:** `backend/src/presentation/issue-links`, `backend/src/application/issue-links`, `backend/src/infrastructure/issue-links`, `frontend/src/features/issues/{IssueRelations.tsx,relations.api.ts,useRelationActions.tsx}`

## Purpose
Lets a task or bug declare a typed, directional relationship to another issue — "blocks", "is blocked by", "parent of", "sub-issue of", "related to", "duplicate of". Relations are cross-type (a bug can block a task) and rendered as a grouped list in the issue detail sidebar, with a "Mark as ▸" menu + issue picker to create them.

## Where it lives
- Backend: `IssueLinksController` (presentation) → `GetIssueLinksUseCase` / `CreateIssueLinkUseCase` / `DeleteIssueLinkUseCase` (application) → `IIssueLinkRepository` port, implemented in infrastructure against Mongoose `IssueLinkSchema`.
- Frontend: `IssueRelations.tsx` (read-only grouped list + unlink, in the detail sidebar), `useRelationActions.tsx` (the "Mark as ▸" submenu + `PickIssueDialog` for creating a link), `relations.api.ts` (React Query hooks: `useIssueRelations`, `useCreateIssueRelation`, `useDeleteIssueRelation`).

## Data model & key fields
Mongoose collection backing `IssueLinkDoc` (via `IssueLinkSchema`):
- `_id` (uuid), `tenantId`, `issueType` (source end's kind, `'task'|'bug'`), `sourceId`, `targetId`, `relationType`, `createdBy`, `createdAt` (no `updatedAt`).
- Stored **directionally** source → target. Unique index on `(tenantId, issueType, sourceId, targetId, relationType)` — repeat create is idempotent. Two extra indexes `(tenantId, sourceId)` and `(tenantId, targetId)` (kind-agnostic, no `issueType`) back the "both directions for this issue" read.
- `RelationType` enum: `BLOCKS`, `BLOCKED_BY`, `PARENT_OF`, `SUB_ISSUE_OF`, `RELATED_TO` (symmetric), `DUPLICATE_OF` (symmetric, its own inverse). `INVERSE_RELATION` map flips a row's meaning when read from the target side (one stored row reads correctly from both issues).
- `IssueKind` enum (`Task`/`Bug`) — mirrors the frontend `IssueKind`; both kinds live in the same unified `issues` collection, read via `IIssueRepository`.

## API surface
- `GET /v1/issue-links?issueId=` — every relation touching an issue (either end), resolved to `IssueLinkResponseDto[]` (flat: `id`, `relationType` already flipped to caller's perspective, `targetKind`, `targetId`, `targetShortId`, `targetTitle`, `targetStatus`). Rows whose other end was deleted are silently dropped.
- `POST /v1/issue-links` — body `{ issueType, sourceId, targetId, relationType }` (`CreateIssueLinkDto`); rejects self-links and cross-tenant targets; returns the *source* issue's full relation list (not just the new row).
- `DELETE /v1/issue-links/:id` — 204, tenant-scoped.

## Relationships to other modules
- **[[module-issues]] / [[module-tasks]] / [[module-bugs]]** — the core dependency. Both link endpoints validate the source/target belong to the tenant via `IIssueRepository` (unified issues collection for tasks and bugs); `GetIssueLinksUseCase` resolves each linked id's `shortId`/`title`/`status`/kind through the same repo. `IssueRelations` renders in the task/bug detail sidebar and routes to `/tasks/:id` or `/bugs/:id` based on `targetKind`.
- No other module reads or writes issue-links directly — it's a pure two-issue relation, not attached to teams, cycles, or roadmaps.

## Gotchas & conventions
- `issueType` on the stored row is the **source** end's kind only — the target's kind is never stored, always resolved on read (`targetKind` in the response), because links can cross task/bug.
- A link is symmetric-in-meaning for `RELATED_TO`/`DUPLICATE_OF` but still stored as one directional row; direction only matters for display (inverse lookup), not for uniqueness beyond the index tuple.
- Follows CLAUDE.md's flat-DTO convention: `IssueLinkResponseDto`/`IssueRelationDto` inline the linked issue's fields rather than nesting an issue object.
- `POST` intentionally returns the full relation list of the source issue (not the created row) so the frontend can replace its cache in one round trip — mirrored by `useCreateIssueRelation` invalidating `['issue-links', sourceId]`.

## Related skills
[[module-issues]] [[module-tasks]] [[module-bugs]]

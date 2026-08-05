---
name: module-roadmaps
description: Use when working on Roadmaps — the RICE-scored backlog/timeline board at backend/src/*/roadmaps and frontend/src/features/roadmaps, whose per-item columns and OKR links are NOT team statuses or milestone entities. Related to [[module-issues]], [[module-milestones]], [[module-public]].
---

# Module: Roadmaps

**Apps/paths:** `backend/src/presentation/roadmaps`, `backend/src/application/roadmaps`, `backend/src/infrastructure/roadmaps`, `frontend/src/features/roadmaps`, `backend/src/presentation/public/public-roadmaps.controller.ts`

## Purpose
A roadmap is a product's backlog/prioritization board: a set of `RoadmapItemData` cards scored by RICE (reach × impact × confidence / effort), placed into configurable columns ("pools"), and viewable as a Kanban board, RICE table, Gantt/timeline, or workflow view. Items can link to an OKR milestone/objective/key-result and to issues (tasks/bugs) created to execute them. A roadmap can be published as a read-only public link.

## Where it lives
- Backend: `RoadmapsController` (`presentation/roadmaps/roadmaps.controller.ts`) + `PublicRoadmapsController` (`presentation/public/public-roadmaps.controller.ts`, public token read); use-cases in `application/roadmaps/use-cases/roadmap.use-cases.ts` (Create/Get/GetAll/Update/ReplaceItems/AddItem/ReplaceColumns/Delete/SetSharing/GetPublic); `RoadmapEntity`/`RoadmapProps` (`application/roadmaps/domain/entities`); Mongoose `RoadmapDoc`/`RoadmapSchema` (`infrastructure/roadmaps/entities/roadmap.schema.ts`, collection stores `items`/`columns` as `Schema.Types.Mixed` arrays — no sub-schemas).
- Frontend: `RoadmapsPanel.tsx` (list/create/edit — a tab inside the Planning page, not its own page), `RoadmapBoardPage.tsx` (single roadmap board), `RoadmapItemDetailPage.tsx` + `RoadmapItemDetail.tsx`/`RoadmapItemPeekDrawer.tsx` (item detail/peek), `components/RoadmapRiceTable.tsx`, `RoadmapRiceChart.tsx`, `RoadmapGanttView.tsx`, `RoadmapWorkflowView.tsx`, `RoadmapTimingSummary.tsx`, `RoadmapColumnsDialog.tsx` (manage columns); queries in `api.ts`.

## Data model & key fields
`RoadmapDoc`/`RoadmapProps` (collection `roadmaps`): `id`, `tenantId`, `projectId`, `title`, `description`, `items: RoadmapItemData[]`, `columns: RoadmapColumn[]`, `publicEnabled`, `publicToken`, timestamps.

`RoadmapColumn`: `{ key, label, color }` — `key` is the stable value stored on each item's `phase`; `label`/`color` are editable per roadmap. Seeded from `DEFAULT_ROADMAP_COLUMNS` (Now/Next/Later/Done, keyed off `RoadmapPhase` enum) for roadmaps with none yet.

`RoadmapItemData`: `id`, `shortId` (ref `RM-XXXXXXX`, minted server-side, resolved by `findRoadmapItem()` via ref-or-uuid), `title`, `description`, `phase` (a `RoadmapColumn.key`), `status` (`RoadmapItemStatus`: idea/planned/in-progress/done), `difficulty` (easy/medium/hard), RICE inputs `reach`/`impact`/`confidence`/`effort` (`riceScore()` computes it, not stored; effort ≤0 → score 0), `progress` (0-100), `imageUrl`, `startDate`/`endDate` (ISO, own planned window — timeline falls back to linked-task dates when unset), `assignees: RoadmapAssignee[]` (denormalized id+name), `createdAt`/`startedAt`/`completedAt` (lifecycle timestamps, set once then preserved), and OKR link fields `milestoneId`/`objectiveId`/`keyResultId`/`okrLabel` (all denormalized, `''` when unlinked).

## API surface
- `GET /roadmaps` — list (tenant-scoped)
- `POST /roadmaps` — create (Role admin/tester/product)
- `GET /roadmaps/:id`
- `PATCH /roadmaps/:id` — update meta (title/description/projectId)
- `PUT /roadmaps/:id/items` — wholesale replace items (covers move/reorder/edit; frontend does this optimistically)
- `PUT /roadmaps/:id/columns` — replace columns/pools (Role admin/product only)
- `POST /roadmaps/:id/share` — toggle public read-only link, mints/keeps `publicToken`
- `DELETE /roadmaps/:id` — Role admin only
- `GET /public/roadmaps/...` (`PublicRoadmapsController`) — read a roadmap by public token, no auth

## Relationships to other modules
- [[module-issues]] — issues carry `roadmapId`/`roadmapItemId` (see `create-issue.dto.ts`, `update-issue.dto.ts`, `IssueEntity`) linking a task/bug back to the roadmap item it executes; `frontend/src/features/issues/IssueDetailMain.tsx` and `IssuesPage.tsx` read/set these.
- [[module-milestones]] — a roadmap item can link to an OKR objective/key-result via `milestoneId`/`objectiveId`/`keyResultId`, denormalizing `okrLabel` onto the card so it renders without loading the milestone.
- [[module-public]] — `PublicRoadmapsController` serves the shareable read-only view once `publicEnabled` is toggled via `POST /roadmaps/:id/share`.
- [[module-planning]] — `RoadmapsPanel` is a tab of the Planning page, sharing its scroll/header shell rather than owning its own page layout.
- [[module-teams]] — explicitly NOT related for columns: roadmap columns are per-roadmap "pools" edited via that board's `RoadmapColumnsDialog` (`⋯ → Manage columns`), unlike team-board Kanban columns which come from `TeamStatusConfig` in Settings.
- [[module-activity]] — `RoadmapItemDetail.tsx` mounts `ActivityHeader`/`CommentThread`; each item has its own comment thread served by `RoadmapItemActivityController` under `/roadmaps/:roadmapId/items/:itemId/comments`.
- [[module-reactions]] — `RoadmapItemDetail.tsx` mounts the same reaction bar issues use, keyed by `ReactionTargetType.RoadmapItem`.
- [[module-favourites]] — an item can be pinned to the sidebar (`FavouriteKind.RoadmapItem`, resolved against this module's repository by looking the item up inside `roadmap.items`); `RoadmapItemDetail.tsx` renders the `FavouriteButton`.
- [[module-mcp]] — `create_backlog_item` calls `AddRoadmapItemUseCase` directly (it has no REST route of its own — only `PUT :id/items` is public); `create_issue` can link a new issue to a roadmap item via `backlogItemId`, resolved by `findRoadmapItem()`.

## Gotchas & conventions
- Per CLAUDE.md's Kanban board layout rules: a roadmap's columns are **not** team statuses and have no Settings page — they're a roadmap-owned concept, editable only through `RoadmapColumnsDialog`.
- Removing a column that still holds items must prompt "move items where?" first (`RoadmapColumnsDialog`'s `pendingRemoval`/`MoveItemsPrompt` flow) — never silently dumps items into the first column.
- `columns`/`items` are stored as `Schema.Types.Mixed` arrays, not Mongoose sub-schemas — validation lives in the DTOs/entity, not the schema.
- RICE score is always derived (`riceScore()`), never persisted — don't trust a stored `rice` field as source of truth beyond the response DTO snapshot.
- `shortId` is optional/backfilled: legacy items may lack one until next save or the `backfill:roadmap-item-refs` script runs; always resolve items via `findRoadmapItem()` (ref-or-uuid), not direct `id` equality alone.
- `PUT /roadmaps/:id/items` is a full replace, and the frontend (`useReplaceRoadmapItems`) applies it optimistically then resyncs on settle since the server recomputes derived fields.
- Column write (`PUT .../columns`) is admin/product only; item replace is admin/tester/product — narrower role set than most write endpoints.

## Related skills
[[module-issues]] [[module-milestones]] [[module-public]] [[module-planning]] [[module-teams]] [[module-activity]] [[module-reactions]] [[module-favourites]] [[module-mcp]]

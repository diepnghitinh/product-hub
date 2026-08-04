---
name: module-milestones
description: Use when working on Milestones (OKRs) — objectives + key results with weighted progress rollups, at backend/src/{presentation,application,infrastructure}/milestones and frontend/src/features/milestones. Related to module-roadmaps (roadmapIds link), module-teams/module-planning (OKRs tab of the planning page).
---

# Module: Milestones (OKRs)

**Apps/paths:** `backend/src/presentation/milestones`, `backend/src/application/milestones`, `backend/src/infrastructure/milestones`, `frontend/src/features/milestones`

## Purpose
Milestones are OKRs: a title + timeframe (e.g. "H2 Objectives", "Jul–Dec 2026") holding a list
of objectives, each with key results. Every objective owns 100% of its own scope; its key
results divide that 100 between them (locked KRs stay pinned while siblings rebalance). Progress
rolls up bottom-up: KR progress → weighted objective progress → averaged milestone progress.

## Where it lives
- Backend: `MilestonesController` (presentation) → `Create/Get/GetAll/Update/ReplaceObjectives/DeleteMilestoneUseCase` (application/use-cases) → `MilestoneEntity` (domain, DDD aggregate) → `IMilestoneRepository` port → Mongoose repo (infrastructure).
- Frontend: `MilestonesPanel.tsx` (the OKRs tab of the planning page — list + create dialog, a *panel* not a page, portals its `PageHeader` into the topbar), `MilestoneDetailPage.tsx` (objective/KR editor, drag-to-split weights via `WeightSplitBar.tsx` and `weights.ts`), `api.ts` (React Query hooks).

## Data model & key fields
Mongo collection `milestones` (schema `MilestoneDoc` / entity `MilestoneEntity`, props in
`milestone.props.ts`):
- `tenantId`, `title` (≤160), `timeframe` (free text), `status` (`MilestoneStatus`: active |
  completed | archived), `objectives: ObjectiveData[]`, `roadmapIds: string[]`.
- `ObjectiveData`: `id`, `title`, `keyResults: KeyResultData[]`, `weight` (always `OBJECTIVE_WEIGHT`
  = 100, stored so the record is self-describing, not user-editable), `status` (free-text OKR
  status key, `''` = none), `notes`.
- `KeyResultData`: `id`, `title`, `progress` (0–100), `owner`, `weight` (% share of its objective;
  siblings always sum to `TOTAL_KR_WEIGHT` = 100), `locked` (pinned during rebalance), `status`.
- `objectives` is stored as `Schema.Types.Mixed` — no separate KR/objective collection.
- Domain helpers in `milestone.types.ts`: `apportion()` (largest-remainder integer split),
  `normalizeObjectives()`/`normalizeKeyResults()` (re-run on every write *and* implicitly assumed
  on read via the mapper, so pre-rule records present the same invariant-respecting shape without
  a migration), `objectiveProgress()`, `milestoneProgress()`.

## API surface
All under `/v1/milestones` (mounted via `RouterModule` with `path: 'milestones'` in
`presentation.module.ts`):
- `GET /v1/milestones` — list (tenant-scoped)
- `POST /v1/milestones` — create (roles: admin, tester, product)
- `GET /v1/milestones/:id`
- `PATCH /v1/milestones/:id` — update meta (title/timeframe/status/roadmapIds) (admin, tester, product)
- `PUT /v1/milestones/:id/objectives` — replace the whole objectives+KR tree; server re-normalizes
  weights and recomputes progress (admin, tester, product)
- `DELETE /v1/milestones/:id` — admin only

`MilestoneResponseDto` is a flat shape with per-objective and overall `progress` rollups computed
by `MilestoneMapper`, not stored.

## Relationships to other modules
- **[[module-roadmaps]]** — `roadmapIds: string[]` links a milestone to one or more roadmaps;
  editable via the `PATCH .../:id` meta endpoint. No reverse constraint enforced here. The
  primary link runs the other way: a `RoadmapItemData` carries denormalized `milestoneId` /
  `objectiveId` / `keyResultId` / `okrLabel` fields (owned and written by module-roadmaps, not
  this module) so a roadmap card can show what OKR it advances without loading the milestone.
  This module has no query/use-case that reads roadmap items back.
- **[[module-planning]]** — `MilestonesPanel` is the OKRs tab of the planning page (sibling to the
  roadmaps panel, same panel convention: no own page shell, `PageHeader` portals into the topbar).
- **[[module-teams]]** — KR `owner` is a free-text field (not a validated team-member reference in
  this module's source).

## Gotchas & conventions
- Objective weight is a constant (`OBJECTIVE_WEIGHT = 100`), never user-editable — only KR weights
  split. Don't add a UI control for it.
- `ReplaceObjectivesUseCase` (`PUT .../objectives`) replaces the *entire* tree every edit — the
  frontend does full-tree optimistic updates (`useReplaceObjectives`'s `onMutate`) rather than
  per-field PATCHes, because the server re-splits weights and the round trip made dragging feel
  laggy.
- Adding/removing a KR re-splits that objective evenly (`distributeEvenly`) rather than trying to
  preserve a hand-tuned split around a changed set size.
- `apportion()` uses largest-remainder rounding so shares always sum exactly to 100 (e.g. 34/33/33,
  not a lossy even split).
- Score/progress is edited in the UI as 0–10 (`(k.progress / 10).toFixed(1)`) but stored 0–100.

## Related skills
[[module-roadmaps]] [[module-planning]] [[module-teams]]

---
name: module-reactions
description: Use when working on Reactions — the fixed-emoji quick-reaction bar on issue/roadmap-item detail (toggle, per-emoji tallies, optimistic UI), backend/src/{presentation,application,infrastructure}/reactions and frontend/src/features/reactions. Related to module-issues, module-roadmaps.
---

# Module: Reactions

**Apps/paths:** `backend/src/presentation/reactions`, `backend/src/application/reactions`, `backend/src/infrastructure/reactions`, `frontend/src/features/reactions`

## Purpose
Social-style quick reactions attachable to an issue (bug/task) or a roadmap item. Any tenant
member can react with one emoji from a fixed palette; reacting again removes it (toggle). The
bar shows a pill per emoji that has at least one reaction, with a count and a hover tooltip of
who reacted, plus a "+" opening the full palette to add a new one.

## Where it lives
- Backend: `ReactionsController` (`presentation/reactions/reactions.controller.ts`) exposes
  `GET /reactions` and `POST /reactions/toggle`, calling `GetReactionsUseCase` /
  `ToggleReactionUseCase` (`application/reactions/use-cases/`). Persistence via the
  `IReactionRepository` port (`application/reactions/repositories/reaction.repository.ts`),
  implemented by `ReactionRepository` in `infrastructure/reactions/repositories`, backed by the
  `Reaction` Mongoose model (`infrastructure/reactions/entities/reaction.schema.ts`).
- Frontend: `frontend/src/features/reactions/api.ts` (`useReactions`, `useToggleReaction` React
  Query hooks) and `ReactionBar.tsx` (the rendered pill row + emoji picker dropdown). Mounted
  under the Description on `IssueDetailMain.tsx` (bug/task detail) and
  `RoadmapItemDetail.tsx`.

## Data model & key fields
`Reaction` collection (Mongoose model name `Reaction`), one document per (target, emoji, user):
- `_id` (uuid string), `tenantId`, `targetType` (string, see enum), `targetId`, `emoji`,
  `userId`, `userName`, `createdAt` (timestamps: createdAt only, no updatedAt).
- Unique index on `{ tenantId, targetType, targetId, emoji, userId }` — the safety net behind
  toggling (also a plain index on `{ tenantId, targetType, targetId }` for target lookups).
- `ReactionTargetType` enum (`application/reactions/domain/reaction-target-type.enum.ts`):
  `Issue = 'issue'` (both bugs and tasks, keyed by the issue's shared id) and
  `RoadmapItem = 'roadmap-item'`.
- `REACTION_EMOJIS` (`application/reactions/domain/reaction-emoji.ts`): fixed palette
  `['👍','❤️','🎉','😄','🚀','👀']`, mirrored on the frontend in `types/enums`. Enforced
  server-side (`isReactionEmoji`) — not a free emoji picker.
- Domain entity `ReactionEntity`/`ReactionProps` carry the same fields plus `id`
  (`UniqueEntityID`).

## API surface
- `GET /v1/reactions?targetType=&targetId=` — reactions on one target, tallied per emoji
  (`ReactionGroupResponseDto[]`: `emoji`, `count`, `reactedByMe`, `userNames`).
- `POST /v1/reactions/toggle` — body `{ targetType, targetId, emoji }`; adds the caller's
  reaction if absent, removes it if present; returns the target's full updated tallies.

`ReactionMapper.toGroups` folds raw reaction docs into groups, keeping only emojis with ≥1
reaction, in fixed palette order (stable bar layout as counts change).

## Relationships to other modules
- [[module-issues]] — `ReactionBar` mounts under the Description in `IssueDetailMain.tsx` for
  both bug and task detail, using `ReactionTargetType.Issue` with the issue's id as `targetId`.
- [[module-bugs]] / [[module-tasks]] — both ride the shared `Issue` target type; there is no
  separate bug/task reaction target.
- [[module-roadmaps]] — `RoadmapItemDetail.tsx` mounts the same bar with
  `ReactionTargetType.RoadmapItem`.

## Gotchas & conventions
- Reactions are strictly tenant-scoped: every read/write is filtered by `auth.tenantId`, so a
  user can only see/react within their own workspace.
- The palette is enforced server-side (`isReactionEmoji`) — sending an unsupported emoji fails
  the toggle use-case (`Result.fail('Unsupported reaction')`).
- Toggle is a full add/remove of one document per (target, emoji, user), not a counter — the
  unique index is what makes double-adding impossible even under a race.
- Frontend toggle is optimistic (`useToggleReaction`): the pill updates instantly via
  `applyToggle` in the query cache, then is replaced by the server's authoritative group list on
  success, or rolled back with a toast on error.
- `count` can exceed the number of shown `userNames` (a reactor with a blank display name is
  dropped from `userNames` server-side but still counted) — `ReactionBar` folds the overflow
  into a "+N more" tooltip line.

## Related skills
[[module-issues]] [[module-bugs]] [[module-tasks]] [[module-roadmaps]]

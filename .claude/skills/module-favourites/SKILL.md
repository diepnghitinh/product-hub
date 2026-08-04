---
name: module-favourites
description: Use when working on Favourites — the per-user sidebar pin list (star toggle) for issues, roadmap items, and docs, backend/src/{presentation,application}/favourites (no dedicated infra layer; stored embedded on the User) and frontend/src/features/favourites. Related to module-users, module-issues, module-roadmaps.
---

# Module: Favourites

**Apps/paths:** `backend/src/presentation/favourites`, `backend/src/application/favourites`, `frontend/src/features/favourites`

## Purpose
Lets a user pin an issue (bug/task), a roadmap item, or a doc to their sidebar for
one-click access. Each pin is a denormalized snapshot (title + routing hints) so
the sidebar rail renders instantly without re-fetching the entity.

## Where it lives
- Backend: `FavouritesController` (presentation) → `AddFavouriteUseCase` /
  `RemoveFavouriteUseCase` / `GetFavouritesUseCase` (application). There is **no**
  `backend/src/infrastructure/favourites` — favourites have no own collection.
  They're stored as an embedded array on `UserEntity`/`UserSchema`
  (`backend/src/infrastructure/users/entities/user.schema.ts`,
  `backend/src/application/users/domain/entities/user.entity.ts`), persisted via
  `IUserRepository`. `UserEntity.addFavourite`/`removeFavourite` own the mutation
  (add is a no-op if already pinned; remove is idempotent).
- Frontend: `frontend/src/features/favourites/api.ts` (`useFavourites`,
  `useAddFavourite`, `useRemoveFavourite`, `useFavouriteToggle`, `isFavourited`)
  and `FavouriteButton.tsx` (star toggle). Consumed by
  `layouts/sidebar/{Sidebar,ClassicSidebar}.tsx` (renders the pinned list) and by
  detail views that show the star: `IssueDetailMain.tsx`,
  `RoadmapItemDetail.tsx`, `DocWorkspacePage.tsx`, `DocsHubPage.tsx`.

## Data model & key fields
`FavouriteRef` (`backend/src/application/favourites/domain/favourite.ref.ts`),
embedded in the `users` collection:
- `kind`: `FavouriteKind` enum — `'roadmap-item' | 'issue' | 'doc'`
  (`domain/favourite-kind.enum.ts`)
- `refId` — canonical entity id (issue id, roadmap item id, or doc uuid)
- `title` — snapshot at pin time; may drift if the entity is renamed later (accepted trade-off)
- `roadmapId` — set for `roadmap-item` (owning roadmap/board)
- `teamId` — set for `issue` favourites that live on a team board
- `issueKind` — `'bug' | 'task'`, set for `issue` favourites, drives sidebar route/icon
- `createdAt`

`FavouriteResponseDto` mirrors these fields flat (via `FavouriteMapper`).

## API surface
All under `/v1/favourites`, auth required (`AuthUser`):
- `GET /favourites` — the caller's pinned list
- `POST /favourites` — body `{ kind, refId, roadmapId? }`; server re-resolves and
  hydrates the ref from the entity's own repo (title/teamId/issueKind never
  trusted from client), returns the full updated list
- `DELETE /favourites/:kind/:refId` — unpin; idempotent; returns updated list

## Relationships to other modules
- [[module-users]] — favourites are physically part of `UserEntity`/the `users`
  collection; `AddFavouriteUseCase`/`RemoveFavouriteUseCase` load and save through
  `IUserRepository`, not a favourites-specific store.
- [[module-issues]] — `FavouriteKind.Issue` covers both bugs and tasks (one
  unified collection); resolved via `IIssueRepository.findByRef`, with
  `issue.isBug` snapshotted into `issueKind` for sidebar routing (`/bugs` vs
  `/tasks`).
- [[module-roadmaps]] — `FavouriteKind.RoadmapItem` resolves against
  `IRoadmapRepository`, looking the item up inside `roadmap.items`; `roadmapId` is
  required so the sidebar can build the board link + `?item=` deep-link.
- [[module-docs]] — `FavouriteKind.Doc` resolves via `IDocRepository.findByIdOrRef`
  (accepts either the `DOC-…` ref or the uuid); the stored `refId` is always the
  uuid so the pin survives ref backfills.

## Gotchas & conventions
- Add is validated + hydrated server-side per kind (tenant-scoped lookups) — the
  client only sends `kind`/`refId`/`roadmapId`; `title`/`teamId`/`issueKind` are
  always authoritative from the server.
- Frontend mutations are optimistic with rollback (`useAddFavourite`/
  `useRemoveFavourite` in `api.ts`), sharing one query cache key (`['favourites']`)
  between the sidebar and every `FavouriteButton`.
- `FavouriteButton` is the one reusable star toggle — reused across issue detail,
  roadmap item detail, and docs; don't hand-roll another pin control.

## Related skills
[[module-users]] [[module-issues]] [[module-roadmaps]] [[module-docs]]

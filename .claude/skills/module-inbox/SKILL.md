---
name: module-inbox
description: Use when working on Inbox — the per-user notification feed (mentions + assigned bugs) computed live from comments/issues/users, served at backend/src/{presentation,application}/inbox and frontend/src/features/inbox. Related to module-bugs, module-issues, module-activity.
---

# Module: Inbox

**Apps/paths:** `backend/src/presentation/inbox`, `backend/src/application/inbox`, `frontend/src/features/inbox`

## Purpose
A Linear-style notification center: one flat, time-sorted list combining (1) comments that
@mention the user and (2) bugs currently assigned to the user. It is a **read model with no
store of its own** — every call recomputes the list live from the users, issues (bugs), and
comments collections. Read state is tracked per-item on the user document, not as a global
watermark, so an already-read bug that gets updated again legitimately re-surfaces as unread.

## Where it lives
- Backend: `InboxController` (`presentation/inbox/inbox.controller.ts`) → three use-cases in
  `application/inbox/use-cases`: `GetInboxUseCase`, `MarkInboxSeenUseCase`,
  `MarkInboxItemReadUseCase`. No infrastructure layer / no Mongoose schema — it composes
  `IUserRepository`, `IIssueRepository`, and `ICommentRepository` from other modules.
- Frontend: `frontend/src/features/inbox/InboxPage.tsx` (two-pane layout: list + detail) and
  `api.ts` (`useInbox`, `useMarkInboxItemRead`, `useMarkInboxSeen` — TanStack Query with
  optimistic read-state updates).

## Data model & key fields
No dedicated collection. Inbox state piggybacks on `UserEntity.readInboxKeys: string[]`
(`backend/src/application/users/domain/entities/user.entity.ts`) — an array of read notification
keys, with `markInboxItemsRead(keys)` / `isInboxItemRead(key)` helpers.

Computed `InboxItem` (application) / `InboxItemDto` (wire, flat):
- `kind: InboxKind` — `mention` | `assigned-bug` | `doc-mention` (`domain/inbox-kind.enum.ts`)
- `id` — source id (comment id or bug id)
- `refId` — navigation target: bug id, or `<docId>/<docPageId>?comment=<commentId>` for doc mentions
- `key` — stable per-notification id `kind:id:occurrence`, where occurrence is a timestamp
  (comment `createdAt`, bug `updatedAt`) — this is *what* read-tracking is keyed on, and why a
  re-updated assigned bug reappears as unread
- `title` (plain-text snippet via shared `plainSnippet`, max 100 chars, for comments; bug title
  for assigned bugs), `actorName`, `seen: boolean`, `createdAt: Date`

`InboxResponseDto` envelope: `{ items[], unseenCount, seenAt }` — `seenAt` is a legacy field, kept
`null` always now that read state moved per-item.

## API surface
- `GET /v1/inbox` — the current user's inbox (mentions + assigned bugs, most recent first)
- `POST /v1/inbox/seen` — mark every item currently in the inbox read (recomputes then persists all keys)
- `POST /v1/inbox/read` — mark one item read by `{ key }`

## Relationships to other modules
- [[module-bugs]] — the "assigned" section is bugs assigned to the user, fetched via
  `IIssueRepository.findByTenant` filtered to `kind: [IssueKind.BUG]` + `assigneeId: [userId]`
  (bugs are `kind=bug` issues, see [[module-issues]]). `InboxPage` renders the selected bug using
  the shared `<BugDetail>` component straight in its detail pane.
- [[module-issues]] — underlying store for the assigned-bug section; inbox only ever queries it,
  never writes to it.
- [[module-activity]] — mentions come from `ICommentRepository.findMentionsForUser`, the same
  comment store used for issue/doc discussion threads; `plainSnippet` is the same flattening
  helper the @mention webhook (Lark/Telegram) uses, so a mention reads identically everywhere.
- [[module-users]] — read state (`readInboxKeys`) lives on `UserEntity`, not on the inbox items
  themselves; `IUserRepository` is used to load/save it.
- [[module-docs]] — `DOC_MENTION` is a comment mention on a doc page; instead of rendering inline
  it navigates to `/docs/<docId>/<docPageId>?comment=<id>`, since a doc page is a full document,
  not something to inline in a 360px list pane.

## Gotchas & conventions
- There is no `infrastructure/inbox` directory — this module is pure composition over other
  repositories, so don't look for an inbox Mongoose schema; it doesn't exist.
- Read state is **per-item**, not a single "last seen" timestamp — `MarkInboxSeenUseCase`
  literally re-runs `GetInboxUseCase` and stores every current item's key, rather than flipping
  one flag, precisely so late updates re-surface.
- `key` embeds an occurrence timestamp on purpose: a mention's key never changes (comments are
  immutable once posted here), but an assigned bug's key changes every time the bug is updated —
  don't "fix" this into a stable id without breaking the re-surface behavior.
- Mentions are scoped at the repository level to bug and doc-page comments only
  (`ICommentRepository.findMentionsForUser` filters `bugId != '' OR docPageId != ''`) — task and
  roadmap-item mentions never reach the inbox even though the same `comments` collection backs
  them (see [[module-activity]]).
- A comment that mentions its own author is dropped in `GetInboxUseCase` (`c.authorId === userId`
  → skipped) — you never get notified of your own mention.
- Frontend polls `useInbox` every 60s (`refetchInterval`) to keep the topbar badge fresh, and
  both mutations are optimistic (row dot clears / badge decrements immediately, then reconciled
  via `invalidateQueries` in `onSettled`).
- Milestone assignments are explicitly out of scope for now (see the enum's doc comment — planned
  for "Phase 4").

## Related skills
[[module-bugs]] [[module-issues]] [[module-users]] [[module-docs]]

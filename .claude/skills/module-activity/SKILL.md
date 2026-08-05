---
name: module-activity
description: Use when working on Activity — the shared comment-thread engine (issues, doc pages, roadmap items) at backend/src/{presentation,application,infrastructure}/activity and frontend/src/features/activity. Related to module-issues, module-docs, module-inbox, module-storage.
---

# Module: Activity

**Apps/paths:** `backend/src/presentation/activity`, `backend/src/application/activity`, `backend/src/infrastructure/activity`, `frontend/src/features/activity`

## Purpose
Activity is the one comment-thread engine reused across three subjects: an issue (bug or task), a doc page (anchored to a quoted passage), and a roadmap item. It is not a generic audit/change log — there is no field-change history here, only user-authored comment threads, one level deep (a reply always attaches to a root, never to another reply). Doc-page comments additionally support "resolve" to hide a highlight and file the thread under Resolved.

## Where it lives
- Backend: `presentation/activity/{issue,doc,roadmap-item}-activity.controller.ts`; use-cases in `application/activity/use-cases/{issue,doc-comment,roadmap-item-comment}.use-cases.ts`; single `CommentEntity`/`CommentProps` domain model (`application/activity/domain/entities`) shared by all three subjects; `ICommentRepository` (application) implemented by `infrastructure/activity/repositories/comment.repository.ts` against the Mongoose `CommentSchema`.
- Frontend: `features/activity/api.ts` (react-query hooks keyed by a `CommentSource` union: `{kind:'bug'|'task', id}` or `{kind:'roadmapItem', roadmapId, id}`), `CommentThread.tsx` (thread UI, `Avatar`, `ActivityHeader`), `CommentMedia.tsx` (image attachments).

## Data model & key fields
Single `comments` collection (`CommentDoc`/`CommentSchema`), one flat shape for all three subject types:
- Subject ids: `issueId` (canonical, shared with the issue's own `_id`), `bugId`/`taskId` (legacy mirrors set by kind — kept so the inbox keeps resolving bug mentions and the migration stays reversible), `roadmapItemId`, `docId`+`docPageId`.
- Anchoring (doc-page comments only): `anchorExact`/`anchorPrefix`/`anchorSuffix` (quoted text + context, survives edits around it) and `anchorStart` (offset at write time, tie-breaker only). Empty on a page-level comment with no selection.
- Threading: `parentId` — `''` for a root comment, else the root's id (threads are exactly one level deep).
- Resolution (doc-page only): `resolved`, `resolvedById`, `resolvedByName`, `resolvedAt`.
- `authorId`, `authorName`, `body`, `mentions: string[]` (drives inbox notifications), `images: string[]`, `createdAt`, `updatedAt` (equals `createdAt` until edited).

## API surface
- `GET/POST /issues/:issueId/comments`, `PATCH/DELETE /issues/:issueId/comments/:commentId` — shared by bugs and tasks now that both live in the unified `issues` collection.
- `GET /docs/:docId/comment-counts` — unresolved thread count per page (for the page-rail badges), `GET/POST /docs/:docId/pages/:pageId/comments`, `PATCH/DELETE .../comments/:commentId`, `POST .../comments/:commentId/resolve`.
- `GET/POST /roadmaps/:roadmapId/items/:itemId/comments`, `PATCH/DELETE .../comments/:commentId`.
- All list/create/update/delete return the same flat `CommentResponseDto`.

## Relationships to other modules
- [[module-issues]] / [[module-bugs]] / [[module-tasks]]: `IssueActivityController` is the one thread for both bugs and tasks (`:issueId` is the issue's shared id); `CreateIssueCommentUseCase` looks up the issue via `IIssueRepository` to mirror `bugId`/`taskId` by `IssueKind` and to route the mention notification link (`/bugs/:shortId` vs `/tasks/:shortId`).
- [[module-inbox]]: **bug and doc-page** mentions feed the inbox (`ICommentRepository.findMentionsForUser` filters to `bugId != '' OR docPageId != ''`); the FE's `touchesInbox` flag in `sourceConfig` only covers the bug/task issue route (`true` for bugs, `false` for tasks) and is a separate, narrower client-side cache-invalidation concern — task and roadmap-item mentions feed neither. Comment creation on any of the three subjects fires `WebhookEvent.COMMENT_MENTION` via `INotifier` (Lark/Telegram), independent of inbox eligibility — see [[module-webhooks]].
- [[module-public]]: the public team-board card comments endpoint (`GET /v1/public/teams/:token/items/:itemId/comments`) reuses this module's own `GetIssueCommentsUseCase` and `CommentMapper` directly rather than duplicating comment-fetch logic.
- [[module-docs]]: doc-page comments anchor to a text quote inside a doc page's rendered content; `GetDocCommentCountsUseCase` powers the per-page unresolved badge in the doc's page rail. Doc *editing* is Admin/Tester/Product only, but doc *comments* are open to Developers too — the one deliberate role gap between the two controllers. `doc.use-cases.ts`/`doc-page.use-cases.ts` call `ICommentRepository.deleteByDoc`/`deleteByDocPages` to cascade-delete a doc's (or a deleted page subtree's) comments — the only place another module reaches into this repository to write.
- [[module-roadmaps]]: `RoadmapItemActivityController` gives each roadmap item its own comment thread, nested under `/roadmaps/:roadmapId/items/:itemId`.
- [[module-storage]]: `CommentThread.tsx` stages/uploads images and short videos via `useMediaAttachments`/`uploadMedia` (`features/uploads`) before posting; `CommentMedia.tsx` renders the resulting URLs (image → lightbox, video → inline `<video>`).

## Gotchas & conventions
- Threads are exactly one level deep: `resolveParentId` (issue use-case) rewrites a reply-to-a-reply so it always attaches to the top-level root, never chains.
- An unknown or cross-subject `parentId` silently degrades to a top-level comment instead of erroring.
- Edit/delete authorization: the comment's own author, or `Role.ADMIN`/`Role.PRODUCT` — enforced per use-case (`COMMENT_FORBIDDEN` / `COMMENT_DELETE_FORBIDDEN` sentinels mapped to 403 in the controller); doc resolve has its own `COMMENT_RESOLVE_FORBIDDEN`.
- Mention notification text is flattened to plain text (`plainSnippet`) before sending — chat channels take text, not the RTE's HTML.
- Response DTOs are flat per CLAUDE.md convention — no nested objects, one `CommentResponseDto` shape reused across all three subjects; it omits `bugId`/`taskId`/`roadmapItemId` (the caller already knows the subject from the route it called).
- Delete cascades a root's replies **only for doc-page comments** (`DeleteDocCommentUseCase` finds and deletes every reply with `parentId === commentId`); `DeleteIssueCommentUseCase`/`DeleteRoadmapItemCommentUseCase` delete just the one row, so deleting a root comment on an issue or roadmap item leaves its replies orphaned in storage (unreachable via the list, since nothing else references their `parentId`, but not actually removed).

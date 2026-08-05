---
name: module-docs
description: Use when working on Docs — a workspace's written product knowledge (docs → page tree → HTML page bodies, realtime co-edited via a separate collab server, version history, PDF export, public sharing), at backend/src/{presentation,application,infrastructure}/docs and frontend/src/features/docs. Related to module-collab, module-activity, module-issues, module-roadmaps.
---

# Module: Docs

**Apps/paths:**
`backend/src/presentation/docs`, `backend/src/application/docs`, `backend/src/infrastructure/docs`, `frontend/src/features/docs`, and the sibling app `collab/` (Hocuspocus/Yjs sync server, not under `backend/`).

## Purpose
Docs is the workspace's written knowledge base: Notion-like documents made of a tree of pages, each page an HTML body that can be attached to an issue or a roadmap item, versioned by hand, exported to PDF, and optionally published read-only. Bodies are edited **in realtime** by multiple people at once through a separate WebSocket sync server (`collab/`), not through ordinary PATCH-on-save.

## Where it lives
- Backend: `docs.controller.ts` (presentation) → use-cases in `application/docs/use-cases/` (`doc.use-cases.ts`, `doc-page.use-cases.ts`, `doc-page-version.use-cases.ts`, `doc-page-pdf.use-case.ts`) → `application/docs/repositories/*` (interfaces) implemented in `infrastructure/docs/repositories/*` against Mongoose schemas in `infrastructure/docs/entities/*` (`docs`, `docpages`, `docpageversions` collections implied by `DocSchema`/`DocPageSchema`/version schema). PDF export renders server-side via headless Chrome (`services/doc-page-print.ts`) and streams `application/pdf` outside the normal response envelope.
- Frontend: `DocsHubPage.tsx` (list/filter docs by tag), `DocWorkspacePage.tsx` (doc + page tree + editor shell), `components/DocPageTree.tsx`, `DocPageEditor.tsx`, `DocPageStyles.tsx`, `DocVersionHistory.tsx`, `DocAttachments.tsx`, `DocComments.tsx`/`DocCommentLayer.tsx`, `DocLinkDialog.tsx`, `LinkedDocsSection.tsx`, `DocTagsBar.tsx`/`DocTagChip.tsx`; all API calls in `api.ts` (React Query hooks: `useDocs`, `useDoc`, `useDocPage`, `useLinkedDocs`, `useCreateDoc`, `useDuplicateDoc`, `useUpdateDoc`, `useDeleteDoc`, `useSetDocSharing`, `useCreateDocPage`, `useUpdateDocPage`, `useDeleteDocPage`, `useExportDocPagePdf`, `useDocPageVersions`/`useDocPageVersion`/`useSaveDocPageVersion`/`useRestoreDocPageVersion`, `useReorderDocPages`, `useDocComments`/counts/create/update/resolve/delete). Doc-page comment endpoints are served by a separate `DocActivityController` in the activity module, not `DocsController`. Realtime editing lives in `collab/` (frontend subfolder): `useCollabSession.ts` (Hocuspocus provider + Yjs `Awareness` for presence/cursors), `blockDoc.ts`, `editorjsBinding.ts`, `CollabDocEditor.tsx`, `CollabPresence.tsx`, `selection.ts`, `slashMenu.tsx`, `mermaidPreview.ts`, `resetCollabDoc.ts`, `domText.ts`.

## Data model & key fields
- **`DocProps`/`DocDoc`** (`docs` collection): `id`, `tenantId`, `ref` (human ref `DOC-6HCUHKX`, unique per tenant when non-empty, partial index), `title`, `icon`, `color`, `coverUrl`, `tags: string[]`, `createdBy`/`createdByName`, `publicEnabled`, `publicToken`, timestamps.
- **`DocPageProps`/`DocPageDoc`** (`docpages` collection): `id`, `tenantId`, `docId` (page never moves docs), `parentId` (`''` = top-level), `title`, `icon`, `color`, `coverUrl`, `content` (page body as HTML — same shape `RichTextEditor` reads/writes), `links: DocLinkRef[]`, `attachments: DocAttachment[]`, Page Styles fields (`fontStyle`, `fontSize`, `pageWidth`, `showCover`, `showTitle`, `showUpdated`, `showLinks`, `showAttachments` — no schema defaults, so an absent field means "predates Page Styles" and entity getters supply `DEFAULT_PAGE_STYLE`), `order`, `createdBy`, `updatedBy`/`updatedByName`, timestamps. Index on `{ tenantId, 'links.refId' }` for the "docs attached to this record" lookup.
- **`DocPageVersionProps`** (`docpageversions`): `id`, `tenantId`, `docId`, `pageId`, `title`, `content` (frozen snapshot, never patched), `label`, `createdBy`/`createdByName`, `createdAt`.
- **`DocLinkRef`** (`domain/types/doc-link.type.ts`): `{ kind: DocLinkKind, refId, title, roadmapId?, issueKind? }` — a denormalized snapshot link to an issue or roadmap item; `DocLinkKind` = `issue` | `roadmap-item`, mirroring `FavouriteKind`/`ReactionTargetType`.
- **`DocAttachment`**: `{ url, name, contentType, size }` — snapshot of an upload result, not a file-record reference.
- **Enums** (`domain/enums/doc.enums.ts`): `DocFontStyle` (system/serif/mono), `DocFontSize` (small/default/large), `DocPageWidth` (default/full) — presentation-only, mirrored on the frontend.

## API surface
All under the doc controller (no path prefix shown = mounted at `/v1/docs` per module convention); writes gated `Role.ADMIN/TESTER/PRODUCT` (sharing/delete further gated `ADMIN/PRODUCT`), reads open to any signed-in user:
- `GET /` — list docs (with page counts)
- `GET /links?refId=` — doc pages linked to an issue or roadmap item (declared before `:id` to avoid route collision)
- `POST /` — create doc (starts with one page)
- `POST /:id/duplicate` — copy a doc and its whole page tree
- `GET /:id` — doc + page tree (no bodies)
- `PATCH /:id` — update doc meta (title/symbol/cover)
- `POST /:id/share` — toggle public read-only link
- `DELETE /:id` — delete doc + all pages
- `POST /:id/pages` — add a page
- `PUT /:id/pages` — reorder/re-nest pages after drag
- `GET /:id/pages/:pageId` — one page with body
- `GET /:id/pages/:pageId/pdf?locale=` — export page as PDF (streams raw bytes via `@Res()`, bypasses the global `{statusCode,data}` interceptor)
- `PATCH /:id/pages/:pageId` — edit page (title/symbol/cover/body/links)
- `DELETE /:id/pages/:pageId` — delete page + everything nested under it (returns `deletedIds`)
- `GET/POST /:id/pages/:pageId/versions`, `GET /:id/pages/:pageId/versions/:versionId`, `POST /:id/pages/:pageId/versions/:versionId/restore` — version history (restoring saves the current state as a version first)

## Relationships to other modules
- **[[module-activity]]** — doc-page comments are *not* handled by `DocsController`: they're a separate `DocActivityController` (`@Controller('docs/:docId')`, in the activity module) exposing `GET /docs/:docId/comment-counts`, `GET/POST /docs/:docId/pages/:pageId/comments`, `PATCH/DELETE .../comments/:commentId`, `POST .../comments/:commentId/resolve`. Writing a comment is open to `Role.DEVELOPER` too, unlike editing the page body itself (Admin/Tester/Product) — the one deliberate role gap between the two controllers. `application/activity/activity.module.ts` imports `InfrastructureDocsModule` to resolve pages.
- **[[module-collab]]** — the realtime editing engine. A page's live body is *not* owned by this backend's write path; the `collab/` Hocuspocus server holds the Yjs CRDT room (keyed `tenantId:pageId`), seeds it once from `docpages.content`, and debounces writes back into that same field. The docs backend only ever reads/writes the settled HTML — awareness (cursors/selection) never touches the document and is never persisted.
- **[[module-issues]]** and **[[module-roadmaps]]** — `DocLinkRef`/`DocLinkKind` let a page attach to a bug/task (`issue`, with `issueKind`) or a roadmap item (`roadmap-item`, with `roadmapId`); `GET /docs/links?refId=` powers the "linked docs" section shown on an issue or roadmap item's detail view, and `LinkedDocsSection.tsx`/`DocLinkDialog.tsx` are the frontend half.
- **[[module-public]]** — `publicEnabled`/`publicToken` on a doc back a read-only public link, the same sharing convention as roadmaps.
- **[[module-reactions]]** / **[[module-favourites]]** — `DocLinkKind` deliberately mirrors `FavouriteKind`/`ReactionTargetType` strings rather than sharing one enum, per this codebase's one-enum-per-domain convention.
- **[[module-teams]]** — icon/color fields (`icon: TEAM_ICONS name`, `color: TEAM_COLORS value`) reuse the same symbol/accent system teams use for their own icons.
- **[[module-users]]** — `createdBy`/`updatedBy` plus denormalized `*Name` fields avoid a user lookup when rendering bylines; collab presence resolves avatar color via the same `avatarColor` hashing used for `UserAvatar`.
- **[[module-storage]]** — `DocAttachment` (`{url, name, contentType, size}`) is a snapshot of an upload result; `DocAttachments.tsx` calls `uploadMedia` directly (not `useMediaAttachments`, since it must also accept PDFs/Office docs, not just image/video) to populate it.
- **[[module-inbox]]** — a `DOC_MENTION` inbox item doesn't render inline like a normal mention; it navigates to `/docs/<docId>/<docPageId>?comment=<commentId>` (`refId` built as `${c.docId}/${c.docPageId}?comment=${c.id}` in `get-inbox.use-case.ts`).
- **[[module-mcp]]** — `McpCreateDocUseCase` writes an AI-authored page by calling `CreateDocUseCase` then `UpdateDocPageUseCase` (both imported from `@application/docs/use-cases`), converting Markdown/HTML/```mermaid via `mcp-doc-body.ts`.

## Gotchas & conventions
- A page's `content` in Mongo can lag the live document — it's only as fresh as collab's last debounce flush, so reading a page mid-edit via the REST API may not reflect keystrokes still in-flight over the socket.
- Page Styles fields have **no schema default**: absence means "pre-dates Page Styles," not "off." Always read through the entity getters (which fall back to `DEFAULT_PAGE_STYLE`), never assume `false`/`undefined` on the raw doc.
- `ref` can be `''` for docs created before refs existed; the uniqueness index is partial (`$gt: ''`) so those don't collide — a `backfill:doc-refs` script fills them in later.
- The PDF route uses `@Res()` directly and manually sets headers/streams the buffer — it is the one docs endpoint outside the global response envelope.
- Restoring a version snapshots the *current* page as a version first, so restore is never destructive of what was on the page a moment ago.

## Related skills
[[module-activity]] [[module-collab]] [[module-issues]] [[module-roadmaps]] [[module-public]] [[module-teams]] [[module-users]] [[module-storage]] [[module-inbox]] [[module-mcp]]

---
name: module-collab
description: Use when working on Collab (Realtime editing) — the Hocuspocus/Yjs WebSocket server at collab/src that CRDT-syncs doc page bodies and mirrors them back to Mongo. Related to module-docs, module-auth.
---

# Module: Collab (Realtime editing)

**Apps/paths:** `collab/src`

## Purpose
One of product-os's 4 apps (next to `backend`, `frontend`, `saas-admin`) and its own
docker-compose service alongside `db`/`api`/`web`/`admin`. Lets two people co-edit a doc
page body without last-write-wins data loss: a page's body is now a Yjs CRDT
that merges concurrent edits and relays each editor's caret/selection
(awareness), instead of a single HTML string autosaved on a typing pause.

## Where it lives
- Server: `collab/src/server.ts` assembles a Hocuspocus `Server`; `onAuthenticate`
  is the single gate (`src/auth.ts`). `src/index.ts` connects Mongo and listens
  (default port 3002, `PORT` env).
- Extensions wired in `server.ts`: `persistence` (load/store Yjs state),
  `mirror` (Y.Doc → HTML back into Mongo), `presence` (in-memory viewer
  registry), `http` (`/health`, `/presence`, `/reset`).
- Conversion layer, copied verbatim from the browser's own code so client and
  server agree on shape: `src/blockDoc.ts` (CRDT block shape), `src/editorjs.ts`
  (HTML ⇄ blocks), `src/ydoc.ts` (Y.Doc ⇄ HTML: `ydocToHtml`,
  `seedYDocFromHtml`, `resetYDocFromHtml`). `src/dom.ts` installs the JSDOM
  globals `editorjs.ts` needs to run outside a browser. `src/blocknote.ts`/
  `src/docHtml.ts` are the superseded BlockNote-era converters, kept only so
  old code compiles.
- No frontend files live in `collab/`; the editor client is part of
  [[module-docs]]'s frontend feature and connects over WebSocket using the same
  API access token.

## Data model & key fields
- `docpages` (Mongo, **owned by the API/backend**) — collab only reads/writes
  `content`, `docId`, `tenantId`, `updatedAt`, `updatedBy`, `updatedByName`
  (`PageRow` in `src/mongo.ts`). This is the HTML mirror, the truth for reading
  (PDF export, public share, MCP, version snapshots).
- `docpagecrdts` (Mongo, **owned by collab**) — one row per page: `_id` = pageId,
  `tenantId`, `docId`, `state` (Binary, the full encoded Yjs update, not a
  diff), `revision` (incremented per write), `updatedAt` (`CrdtRow` in
  `src/mongo.ts`). Indexed on `{tenantId, docId}`.
- Room name = `` `${tenantId}:${pageId}` `` (`ROOM_SEPARATOR = ':'`, `src/constants.ts`,
  `roomName()`/`parseRoom()` in `src/auth.ts`). `RoomInfo` (`src/rooms.ts`) —
  `{tenantId, pageId, docId}` — is resolved once on load and cached in-memory
  per open room so debounced stores don't re-query Mongo.
- Y.Doc field: `prosemirror` (`DOC_FRAGMENT` in `src/constants.ts`) — client
  binds the editor to `provider.document.getXmlFragment(DOC_FRAGMENT)`.

## API surface
Not a REST/NestJS controller — a raw WebSocket (Hocuspocus sync + awareness)
plus a few plain HTTP endpoints on the same port (`src/http.ts`):
- `WS /` — the Hocuspocus sync connection; `token` = API access token, room =
  `tenantId:pageId`.
- `GET /health` — unauthenticated container healthcheck (documents/connections/
  rooms counts).
- `GET /presence?pages=<id,id,...>` — Bearer-token auth; who's viewing each
  page, for the docs list (max 200 ids/query).
- `POST /reset?page=<id>` — Bearer-token auth, write-role only; re-applies a
  page's stored HTML onto its live Y.Doc (used for version restore reaching
  connected editors), via `openDirectConnection`.

## Relationships to other modules
- [[module-docs]] — the whole reason this service exists. The backend/frontend
  docs feature owns `docpages`/page tree/version history/PDF/public share;
  this service only owns the CRDT log and keeps `docpages.content` in sync so
  every existing consumer of the HTML keeps working untouched.
- [[module-auth]] — authenticates with the *same* JWT the REST API issues
  (`JWT_SECRET` must match byte-for-byte, `src/env.ts`); `TokenPayload`/roles
  mirror `backend/libs/core/interfaces/jwt-payload.interface.ts` and
  `role.enum.ts`. Write access mirrors the API's
  `@Roles(admin, tester, product)` on `PATCH /docs/:id/pages/:pageId`
  (`WRITE_ROLES` in `src/auth.ts`) — everyone else connects read-only.
- Tenant isolation: a room's `tenantId` is checked against the caller's token
  (`assertRoomBelongsToToken`), so a valid token for workspace A can't open
  workspace B's page even knowing its id — the multi-tenant boundary [[module-auth]]
  enforces elsewhere in the API is re-checked here independently.

## Gotchas & conventions
- Split of truth: the Yjs update log (`docpagecrdts`) is truth *while editing*;
  the HTML mirror (`docpages.content`) is truth *for reading*. `mirror.ts` runs
  in `afterStoreDocument` (never `onStoreDocument`) so a rendering bug can only
  produce a stale mirror, never lose keystrokes.
- Migration is lazy, per-page: a page with no `docpagecrdts` row is seeded from
  its stored HTML the first time anyone opens it collaboratively
  (`seedYDocFromHtml`); there is no batch job or flag day.
- Stored CRDT state with zero blocks is treated as leftover from the earlier
  BlockNote build and re-seeded from HTML instead of trusted — it isn't
  convertible.
- One process only: presence is in-memory and a document is pinned to whichever
  instance loaded it — this scales up, not out (needs Hocuspocus's Redis
  extension to run >1 replica).
- Client and server agree on the block schema because they run the *same code*,
  not a hand-kept-in-sync copy: `npm run sync` (`scripts/sync-shared.ts`) copies
  `blockDoc.ts` and `editorjs.ts` verbatim from the frontend, stamping a
  "GENERATED FILE — do not edit here" banner, and `npm run typecheck` runs
  `sync-shared.ts --check` first, failing the build if a copy has drifted from
  its source. Mermaid is its own Editor.js block type (`type: 'mermaid'`, `data:
  { code }`), round-tripped via `mermaid-block`/`mermaid-source` marker classes
  in the HTML — `codeBlock`+`language: mermaid` was the superseded BlockNote
  scheme (`blocknote.ts`/`docHtml.ts`), not the live one.
- Without `src/dom.ts`'s JSDOM install, `editorjs.ts` doesn't throw — every DOM
  global it touches is behind a `typeof … === 'undefined'` guard, so it just
  quietly returns the whole page as one paragraph of escaped markup.
  `assertDom()` (called from `ydocToHtml`/`seedYDocFromHtml`) turns that into a
  loud failure instead.
- Body autosave via REST `PATCH` must not run alongside this service for the
  same page — both write `docpages.content` and the last write wins.
- Verification: `npm run smoke` (shape round-trip, no DB), `npm run verify`
  (real server + Mongo + WebSocket clients, asserts role gating, tenant
  isolation, presence, mirror correctness), `npm run corpus` (round-trips every
  real page's HTML, read-only), `npm run sync -- --check` (fails if
  `blockDoc.ts`/`editorjs.ts` have drifted from their frontend source; also run
  as the first step of `npm run typecheck`).

## Related skills
[[module-docs]] [[module-auth]]

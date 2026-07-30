# product-hub collab

The Yjs sync server behind collaborative doc editing — the fourth service, next
to `db`, `api` and `web`.

Two people editing the same doc page used to be a silent data loss: the body was
one HTML string, autosaved on a pause in typing, and whoever paused last
overwrote the other. This service replaces that with a CRDT, so edits merge
instead of colliding, and relays the *awareness* channel that carries each
person's caret and selection.

## The idea in one paragraph

A doc page's body now has two representations. The **Yjs update log**
(`docpagecrdts`) is the truth while people are editing — it is what merges two
people typing in the same paragraph. The **HTML mirror** (`docpages.content`,
the field that already existed) is the truth for reading, and this service keeps
it up to date. That split is what let collaborative editing land without
touching PDF export, public share links, MCP, version snapshots, or the read
view — all of which still read exactly the HTML they read before.

## Run it

```bash
./dev.sh                     # from the repo root: mongo + api + web + collab
```

Standalone:

```bash
cp config/example.env.local config/.env.local   # first run
npm install
npm run dev                  # ws://localhost:3002
```

`JWT_SECRET` must match the API's byte for byte and `MONGODB_URI` must point at
the same database — clients authenticate here with the same access token they
use for REST calls, and the mirror writes into the collection the API owns.

## Verify it

```bash
npm run smoke     # html → Y.Doc → html round trip, shape by shape. No database.
npm run verify    # the real server, real Mongo, three real WebSocket clients.
npm run corpus    # every page in the database, round-tripped. Read-only.
```

`npm run smoke` covers the shapes we thought of — 71 checks, one group per stored
shape, each going through a real `Y.Doc` so anything the schema drops is caught.

`npm run corpus` covers the pages we actually have, which is a different question:
it round-trips every non-empty `docpages.content` and fails if a page loses a word
or a shape. It answers "what would change if collaborative editing were switched
on for everything tomorrow" and prints the documented changes separately from the
failures. It never writes.

`npm run verify` is the one that matters. It creates its own scratch page in a
scratch tenant, runs the actual server in-process, and asserts that:

- an existing page's HTML becomes a Y.Doc, so old docs don't open blank
- two people editing different paragraphs **both keep their text**
- each client sees the other's identity and colour on the awareness channel —
  the same channel that carries caret and selection
- `/presence` answers for the docs list without opening a socket
- a `developer`'s edits are dropped, matching the REST `@Roles`
- a token for one workspace cannot open another workspace's page
- `docpages.content` catches up, so PDF / public / MCP stay correct
- a page seeded with every shape it can hold — checklist, mermaid, table headers,
  image width, toggle, code, quote, divider — comes back out with all of them
- a later session loads the merged text from stored state

It deletes everything it created on the way out.

## The contract the client has to follow

| | |
|---|---|
| URL | `ws://localhost:3002` in dev, `/collab` through nginx in Compose |
| Room name | `` `${tenantId}:${pageId}` `` — see `roomName()` in `src/auth.ts` |
| Token | the API access token, passed as the provider's `token` |
| Y.Doc field | `prosemirror` (`DOC_FRAGMENT`) — bind the editor to `provider.document.getXmlFragment(DOC_FRAGMENT)` |
| Awareness state | `{ user: { userId, name, color, avatarUrl? } }` |

Get the fragment name wrong and nothing errors — both sides just read an empty
document. Get the room name wrong and the connection is refused.

## What's inside

| file | job |
|---|---|
| `src/server.ts` | assembles the server; `onAuthenticate` is the only gate |
| `src/auth.ts` | token verification, room parsing, which roles may write |
| `src/persistence.ts` | loads/stores the Yjs state; seeds a new page from its HTML |
| `src/mirror.ts` | renders the Y.Doc back into `docpages.content` |
| `src/blocknote.ts` | Y.Doc ⇄ blocks, serialised (BlockNote shims globals per call) |
| `src/docHtml.ts` | blocks ⇄ our stored HTML — hand-written, and why is in its header |
| `src/presence.ts` | who is in which page, in memory |
| `src/http.ts` | `/health` and `/presence` |

Authorization mirrors the API deliberately: `admin`, `tester` and `product` get
a writable connection (the same set as `@Roles` on
`PATCH /docs/:id/pages/:pageId`), everyone else connects read-only. Reading a doc
was never gated, and a read-only connection is what lets a developer watch a
spec being written.

## Collections

| collection | owner | what |
|---|---|---|
| `docpages` | the API | we read `content` to seed, and write the mirror back |
| `docpagecrdts` | this service | one row per page: the whole encoded Yjs state, not a diff |

There is no migration to run. A page converts to CRDT the first time somebody
opens it collaboratively, and its original HTML is still sitting in `content`.

## Known seams

- **No custom blocks — and that is now a decision.** `src/blocknote.ts` uses the
  *default* block schema, because everything the doc editor can write fits it:
  BlockNote already ships toggle, checklist, quote, divider, table, image and
  video, and a mermaid diagram is a `codeBlock` whose `language` is `mermaid`.
  Client and server therefore agree on the schema without sharing any code to
  define it. Adding a custom block breaks that: the server would need the same
  schema, and blocks it doesn't know render as empty paragraphs in the mirror —
  which is what PDF export and public share links read.
- **An image in a table cell becomes a link to itself.** BlockNote's
  `TableCell.content` is `InlineContent[]`, so a picture cannot live in a cell at
  any price. The converter keeps the file reachable rather than dropping it: the
  cell holds a link labelled with the image's alt text. It degrades once and is
  stable after that. This is the only lossy conversion, and the only one that
  changes what a reader sees.
- **Image widths are pixels now.** Stored pages size images in percent; BlockNote's
  `previewWidth` is a pixel count. A percentage is resolved once against a 704px
  nominal page column (`PAGE_COLUMN_PX`), so an image keeps its size on a normal
  page but stops growing when the page is set to full width. Table *row* heights
  have no BlockNote equivalent and are dropped; no stored page uses one.
- **Code blocks can now carry a language.** Editor.js had no such concept, so
  nothing stored has one and a bare `<pre><code>` stays bare. BlockNote's picker
  can set one, and it round-trips as `class="language-x"`. Opening such a page in
  the old editor loses the language but nothing else.
- **The client must stop autosaving the body.** While the old `PATCH` of
  `content` is still running alongside this service, the two write to the same
  field and the last one wins. Body autosave comes out when the editor is
  switched over; title, icon, links, styles and attachments stay on REST.
- **One process.** Presence is in memory and documents are held by whichever
  instance loaded them, so this scales up but not out. Running more than one
  replica needs the Hocuspocus Redis extension.

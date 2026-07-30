import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { JSDOM } from 'jsdom';
import type * as Y from 'yjs';
import { DOC_FRAGMENT } from './constants.js';
import { blocksToHtml, htmlToBlocks, type DocBlock } from './docHtml.js';

/**
 * SUPERSEDED by `ydoc.ts`, which does the same two jobs for the Editor.js
 * document the app went back to. Nothing on the live path imports this any more
 * — only `scripts/smoke-blocknote.ts` and the BlockNote dependencies it needs.
 * Kept for now so the previous editor's conversions are still readable next to
 * their replacement; safe to delete along with `docHtml.ts`, that smoke script,
 * and `@blocknote/*` + `y-prosemirror` in package.json.
 *
 * BlockNote conversions, server-side.
 *
 * Two jobs: turn a live Y.Doc into the HTML mirror the rest of the app reads,
 * and turn a page's existing HTML into a Y.Doc the first time somebody opens it
 * with the collaborative editor.
 *
 * BlockNote's own HTML importer and exporter are deliberately not used — see the
 * header of `docHtml.ts` for what they cost when measured against real pages.
 * What BlockNote *is* used for is the half only it can do: moving blocks in and
 * out of a Y.Doc, which is schema work, not markup work.
 *
 * The schema is the default one, and that is now a decision rather than a
 * placeholder: the editor adds no custom blocks. A mermaid diagram is a code
 * block whose `language` is `mermaid`, so client and server agree on the schema
 * without having to share any code to define it.
 */
let editor: ServerBlockNoteEditor | null = null;

function serverEditor(): ServerBlockNoteEditor {
  // Created on first use rather than at import: it spins up a JSDOM instance,
  // and a failure here should surface as a mirror error we can log, not as an
  // unexplained crash while the module graph is still loading.
  editor ??= ServerBlockNoteEditor.create();
  return editor;
}

/**
 * The DOM the HTML parser runs in.
 *
 * Ours, not BlockNote's. `ServerBlockNoteEditor._withJSDOM` puts `document` and
 * `window` on globals for the duration of a call but never `DOMParser`, so
 * borrowing its shim would work right up until it didn't. Owning one instance
 * also means parsing does not have to happen inside a BlockNote call at all.
 */
let parser: DOMParser | null = null;

function domParser(): DOMParser {
  if (!parser) {
    const { DOMParser: JsdomParser } = new JSDOM().window;
    parser = new JsdomParser();
  }
  return parser;
}

/**
 * Conversions run one at a time.
 *
 * `ServerBlockNoteEditor` shims `document` and `window` onto globals for the
 * duration of a call (its own comment calls this out). Two conversions
 * overlapping would see each other's DOM, so the fix is to never overlap: every
 * caller queues behind the last one. Renders are debounced to once every couple
 * of seconds per page, so the queue never becomes the bottleneck.
 */
let tail: Promise<unknown> = Promise.resolve();

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  // Keep the chain alive after a failure — one bad page must not wedge the queue.
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** The Y.Doc as the semantic HTML the app already stores. */
export function ydocToHtml(ydoc: Y.Doc): Promise<string> {
  return exclusive(async () => {
    const server = serverEditor();
    const blocks = server.yDocToBlocks(ydoc, DOC_FRAGMENT) as unknown as DocBlock[];
    return blocksToHtml(blocks);
  });
}

/**
 * Fills an empty Y.Doc from a page's stored HTML.
 *
 * Only ever called on the first collaborative open of a page, before any client
 * has synced: it replaces the fragment wholesale, so running it against a
 * document that already has history would throw that history away.
 */
export function seedYDocFromHtml(ydoc: Y.Doc, html: string): Promise<void> {
  return exclusive(async () => {
    // An empty page is left completely untouched. Seeding an empty paragraph
    // would race the client's own initialisation into two of them on first open.
    if (!html.trim()) return;

    const blocks = htmlToBlocks(html, domParser());
    if (!blocks.length) return;
    serverEditor().blocksToYXmlFragment(blocks as never, ydoc.getXmlFragment(DOC_FRAGMENT));
  });
}

/**
 * Replaces a *live* Y.Doc's content with a page's stored HTML.
 *
 * This is version restore. `seedYDocFromHtml` can't do it: it assumes an empty
 * fragment nobody has synced yet, and the whole point here is that people are
 * connected and looking at the page — the restore has to reach their screens.
 *
 * It does, because this is an ordinary Yjs edit. `blocksToYXmlFragment` diffs the
 * fragment against the target and writes deletes and inserts, so every connected
 * client receives it as an update and BlockNote applies it under their cursor
 * without a reload. Wrapping it in one transaction means one update on the wire
 * and one entry in undo, rather than a burst per block.
 *
 * Unlike the seed, an empty restore is honoured: restoring a version whose body
 * was empty must actually clear the page.
 */
export function resetYDocFromHtml(ydoc: Y.Doc, html: string): Promise<void> {
  return exclusive(async () => {
    const blocks = html.trim() ? htmlToBlocks(html, domParser()) : [];
    const fragment = ydoc.getXmlFragment(DOC_FRAGMENT);
    ydoc.transact(() => {
      if (!blocks.length) {
        fragment.delete(0, fragment.length);
        return;
      }
      serverEditor().blocksToYXmlFragment(blocks as never, fragment);
    }, RESET_ORIGIN);
  });
}

/**
 * Marks a reset as ours rather than a client's, so the mirror can tell the two
 * apart in a log. Any non-null origin also keeps it out of a client's undo stack
 * as *their* edit — restoring a version isn't something one person can ⌘Z.
 */
export const RESET_ORIGIN = 'doc-version-restore';

/**
 * The conversions on their own — the same code path the mirror and the seed take,
 * reachable without a Y.Doc. Needs no lock: parsing and serialising touch only
 * our own JSDOM, never the globals BlockNote swaps in and out.
 */
export function convertHtml(html: string): { blocks: DocBlock[]; html: string } {
  const blocks = htmlToBlocks(html, domParser());
  return { blocks, html: blocksToHtml(blocks) };
}

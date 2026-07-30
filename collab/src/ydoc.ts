import { randomUUID } from 'node:crypto';
import type * as Y from 'yjs';
import { blocksOf, readBlocks, replaceBlocks, type StoredBlock } from './blockDoc.js';
import { assertDom } from './dom.js';
import { blocksToHtml, htmlToBlocks, type HtmlEditorBlock } from './editorjs.js';

/**
 * Editor.js ⇄ Y.Doc, server-side.
 *
 * Two jobs: turn a live Y.Doc into the HTML mirror the rest of the app reads,
 * and turn a page's existing HTML into a Y.Doc the first time somebody opens it
 * collaboratively.
 *
 * Both halves are the *browser's own code*, copied in rather than reimplemented:
 * `blockDoc.ts` is the CRDT shape the binding writes, and `editorjs.ts` is the
 * same HTML converter the single-writer editor has always saved through. That is
 * the whole reason a page can be edited collaboratively on Monday, by one person
 * over REST on Tuesday, and read back identically both times — there is one
 * converter, not a server dialect of one.
 */

/**
 * Marks a restore as ours rather than a client's, so the mirror can tell the two
 * apart in a log. Any non-null origin also keeps it out of a client's undo stack
 * as *their* edit — restoring a version isn't something one person can ⌘Z.
 */
export const RESET_ORIGIN = 'doc-version-restore';

/** The first collaborative open of a page that predates the CRDT. */
export const SEED_ORIGIN = 'doc-seed';

/**
 * Block ids for HTML that never had any.
 *
 * Length and alphabet don't matter to anything — Editor.js accepts whatever id
 * it is handed and the binding only ever compares them — but they must be unique
 * within a page, because that is what tells "this block moved" from "this block
 * is new".
 */
const newId = (): string => randomUUID().replace(/-/g, '').slice(0, 10);

const withIds = (blocks: HtmlEditorBlock[]): StoredBlock[] =>
  blocks.map((block) => ({
    id: newId(),
    type: block.type,
    data: block.data as unknown as Record<string, unknown>,
  }));

/** The Y.Doc as the semantic HTML the app already stores. */
export function ydocToHtml(ydoc: Y.Doc): string {
  assertDom();
  return blocksToHtml(readBlocks(blocksOf(ydoc)) as unknown as HtmlEditorBlock[]);
}

/**
 * Fills an empty Y.Doc from a page's stored HTML.
 *
 * Only ever called on the first collaborative open of a page, before any client
 * has synced: it replaces the block list wholesale, so running it against a
 * document that already has history would throw that history away.
 */
export function seedYDocFromHtml(ydoc: Y.Doc, html: string): void {
  // An empty page is left completely untouched. Seeding an empty paragraph would
  // race the client's own initialisation into two of them on first open.
  if (!html.trim()) return;
  assertDom();
  const blocks = withIds(htmlToBlocks(html));
  if (!blocks.length) return;
  replaceBlocks(blocksOf(ydoc), blocks, SEED_ORIGIN);
}

/**
 * Replaces a *live* Y.Doc's content with a page's stored HTML.
 *
 * This is version restore. `seedYDocFromHtml` can't do it: it assumes a document
 * nobody has synced yet, and the whole point here is that people are connected
 * and looking at the page — the restore has to reach their screens.
 *
 * It does, because this is an ordinary Yjs edit: one transaction of deletes and
 * inserts, which every connected client receives as a single update and applies
 * without a reload. The restored blocks carry fresh ids on purpose — a restore
 * is not a merge, and matching ids would have the binding try to reconcile the
 * old text into the new blocks.
 *
 * Unlike the seed, an empty restore is honoured: restoring a version whose body
 * was empty must actually clear the page.
 */
export function resetYDocFromHtml(ydoc: Y.Doc, html: string): void {
  assertDom();
  const blocks = html.trim() ? withIds(htmlToBlocks(html)) : [];
  replaceBlocks(blocksOf(ydoc), blocks, RESET_ORIGIN);
}

/**
 * The conversions on their own — the same code path the mirror and the seed
 * take, reachable without a Y.Doc. What the corpus check runs against.
 */
export function convertHtml(html: string): { blocks: StoredBlock[]; html: string } {
  assertDom();
  const blocks = withIds(htmlToBlocks(html));
  return { blocks, html: blocksToHtml(blocks as unknown as HtmlEditorBlock[]) };
}

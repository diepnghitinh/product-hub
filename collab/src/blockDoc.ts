/* GENERATED FILE — do not edit here.
 *
 * Copied verbatim from frontend/src/features/docs/collab/blockDoc.ts by `npm run sync`.
 * Edit the source, run the script, commit both. `npm run typecheck` fails if
 * this copy and its source have drifted.
 */
/**
 * How an Editor.js document lives inside a Y.Doc.
 *
 * BlockNote could hand Yjs a ProseMirror fragment and be done; Editor.js has no
 * such binding, so the shape is ours and this file *is* the contract — the
 * browser writes it (see `editorjsBinding.ts`) and the sync server reads it back
 * out to render the HTML mirror. Both sides load this same module: the collab
 * package's copy is generated from this file, so the two cannot drift.
 *
 *   Y.Array('blocks')
 *     └── Y.Map per block
 *           id    : string   the Editor.js block id, shared by every client
 *           type  : string   'paragraph' | 'header' | 'table' | …
 *           data  : object   the tool's data *minus* its text fields (plain JSON)
 *           <field>: Y.Text  one per entry in TEXT_FIELDS[type]
 *
 * The split between `data` and the Y.Texts is the whole design decision, and it
 * is a trade-off worth stating plainly:
 *
 *  · A **text** field is a Y.Text, so two people typing in the same paragraph
 *    merge character by character — the thing "realtime" actually means.
 *  · Everything else (a list's items, a table's cells, an image's file) is plain
 *    JSON, written whole. Concurrent edits to *one* such block resolve
 *    last-writer-wins rather than merging. That is the honest cost of a
 *    block editor whose structured tools keep their state as one object; the
 *    editor shows who else is in a block so it doesn't happen silently.
 *
 * Different blocks always merge, whatever their type — which is the case that
 * actually happens when two people write in one page.
 */
import * as Y from 'yjs';

/** The Y.Doc field holding the block list. Both sides must agree. */
export const BLOCKS_KEY = 'blocks';

/**
 * Which of a tool's data fields hold text a person types, in the order their
 * editable elements appear in the block. The order matters: the browser reads
 * them straight off the DOM (`[contenteditable]` / `<textarea>`) rather than
 * asking each tool, which is what makes the read synchronous — and a synchronous
 * read is what stops a keystroke being lost between the DOM and the CRDT.
 *
 * A tool that isn't listed here is synced as one JSON value. Adding one is a
 * two-line change, but only do it when the tool's editables really do map 1:1,
 * in order, onto its data fields.
 */
export const TEXT_FIELDS: Record<string, readonly string[]> = {
  paragraph: ['text'],
  header: ['text'],
  quote: ['text'],
  // <summary> first, then the folded body — the order they render in.
  toggle: ['summary', 'text'],
  code: ['code'],
  mermaid: ['code'],
};

/** Marks a Yjs transaction as this client's own, so its observer can skip it. */
export const LOCAL_ORIGIN = 'editorjs-local';

/** A block the way Editor.js saves it (and the way the HTML converter wants it). */
export interface StoredBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export type YBlock = Y.Map<unknown>;
export type YBlocks = Y.Array<YBlock>;

export const textFieldsOf = (type: string): readonly string[] => TEXT_FIELDS[type] ?? [];

/** The block list of a doc. */
export const blocksOf = (doc: Y.Doc): YBlocks => doc.getArray<YBlock>(BLOCKS_KEY);

/** One block's text field, or '' when the tool has no such field. */
export function textOf(block: YBlock, field: string): string {
  const value = block.get(field);
  return value instanceof Y.Text ? value.toString() : '';
}

/**
 * A Y.Map for a block. Not attached to a document yet — Yjs requires a type to
 * be integrated before it can be read, so callers insert it and then read back.
 */
export function toYBlock(block: StoredBlock): YBlock {
  const map = new Y.Map<unknown>();
  const fields = textFieldsOf(block.type);
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(block.data ?? {})) {
    if (!fields.includes(key)) rest[key] = value;
  }
  map.set('id', block.id);
  map.set('type', block.type);
  map.set('data', rest);
  for (const field of fields) {
    map.set(field, new Y.Text(String(block.data?.[field] ?? '')));
  }
  return map;
}

/** The inverse: one block as Editor.js expects to be handed it. */
export function fromYBlock(map: YBlock): StoredBlock {
  const type = String(map.get('type') ?? 'paragraph');
  const data: Record<string, unknown> = { ...((map.get('data') as object) ?? {}) };
  for (const field of textFieldsOf(type)) data[field] = textOf(map, field);
  return { id: String(map.get('id') ?? ''), type, data };
}

export const readBlocks = (blocks: YBlocks): StoredBlock[] => blocks.map(fromYBlock);

/**
 * Replaces the whole list — seeding a page on its first collaborative open, and
 * restoring a version onto the screens of everyone currently reading it.
 *
 * One transaction, so connected clients receive it as a single update and apply
 * it in one repaint instead of watching the page rebuild block by block.
 */
export function replaceBlocks(blocks: YBlocks, next: StoredBlock[], origin: unknown): void {
  const doc = blocks.doc;
  const run = () => {
    if (blocks.length) blocks.delete(0, blocks.length);
    if (next.length) blocks.insert(0, next.map(toYBlock));
  };
  if (doc) doc.transact(run, origin);
  else run();
}

/**
 * Edits a Y.Text into `next` with the smallest edit that gets there: keep the
 * common prefix and suffix, replace what's between.
 *
 * Minimal matters for more than bytes on the wire. Replacing the whole string
 * would delete and re-insert every character, which moves everyone else's cursor
 * to the start of the paragraph and turns a one-letter fix into a conflict with
 * whatever they were typing.
 */
export function applyTextDiff(text: Y.Text, next: string): boolean {
  const prev = text.toString();
  if (prev === next) return false;

  const max = Math.min(prev.length, next.length);
  let start = 0;
  while (start < max && prev[start] === next[start]) start += 1;
  let end = 0;
  while (end < max - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) {
    end += 1;
  }

  const removed = prev.length - start - end;
  const inserted = next.slice(start, next.length - end);
  if (removed > 0) text.delete(start, removed);
  if (inserted) text.insert(start, inserted);
  return true;
}

/** Structural equality for the plain-JSON half of a block's data. */
export function sameData(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

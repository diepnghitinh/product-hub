// What "a list" is, in the two shapes this editor needs it in — and the three
// things people type to start one.
//
// A list gets made from four places now: the `/` menu in a block, the `/` menu in
// a table cell, and the `*`/`1.`/`[]` shortcuts in either. They all have to agree,
// because a bullet written in a cell and a bullet written in a paragraph end up in
// the same stored HTML and are painted by the same CSS. So the markup and the
// block data live here, once, instead of being spelled out at each call site.
import { CHECK_LIST_CLASS } from '@/lib/editorjs';

/**
 * A plain list inside a table cell. A cell holds HTML, not blocks, so its lists
 * are ordinary `<ul>`/`<ol>` wearing this class — the same one the read view and
 * the PDF export already style.
 */
export const CELL_LIST_CLASS = 'rte-list';

export type ListStyle = 'unordered' | 'ordered' | 'checklist';

/**
 * A list *block*'s data, seeded with the one empty row the author is about to
 * type into.
 *
 * Not cosmetic: `@editorjs/list` v2 recognises the legacy checklist format by
 * reading `'text' in data.items[0]`, so an empty `items` array reads a property
 * of `undefined` and the whole insert throws before the block is built —
 * `/bullet` did nothing at all.
 */
export function listBlockData(style: ListStyle, content = '') {
  return {
    style,
    meta: {},
    items: [{ content, meta: style === 'checklist' ? { checked: false } : {}, items: [] }],
  };
}

/**
 * A list inside a table cell, as inline HTML. The item is seeded with a
 * non-breaking space so the caret has something to hold on to — an empty element
 * loses it (see `trimSeedPad`, which drops the padding again once there is real
 * text).
 */
export function cellListHtml(style: ListStyle, content = '&nbsp;'): string {
  if (style === 'checklist') {
    return `<ul class="${CHECK_LIST_CLASS}"><li data-checked="false">${content}</li></ul>`;
  }
  const tag = style === 'ordered' ? 'ol' : 'ul';
  return `<${tag} class="${CELL_LIST_CLASS}"><li>${content}</li></${tag}>`;
}

/**
 * Drop the `&nbsp;` a new item or chip was seeded with, once the author has typed
 * something real into it — so the line is saved as `<li>Ship it</li>` and not
 * `<li>&nbsp;Ship it</li>`. Fires at most once, and only while the padding is
 * still the first thing in the node.
 *
 * `target` is either the padding text node itself or the element holding it; an
 * element is re-read on each input, because the browser may replace the text node
 * it was seeded with.
 */
export function trimSeedPad(host: HTMLElement, target: Node | null | undefined) {
  if (!target) return;
  const onInput = () => {
    if (!target.isConnected) return host.removeEventListener('input', onInput);
    const text = (target.nodeType === Node.TEXT_NODE ? target : target.firstChild) as Text | null;
    if (text?.nodeType !== Node.TEXT_NODE || !text.data.startsWith('\u00a0')) return;
    if (text.data.length < 2) return; // still empty — the caret needs it
    text.deleteData(0, 1);
    host.removeEventListener('input', onInput);
  };
  host.addEventListener('input', onInput);
}

/**
 * The Notion-style shortcuts, and only those: `*` or `-` for a bullet, `1.` for a
 * number, `[]` for a to-do. Deliberately a short list — every extra pattern is a
 * character sequence someone can no longer type at the start of a line.
 */
const MARKERS: Array<{ test: RegExp; style: ListStyle }> = [
  { test: /^[*-]$/, style: 'unordered' },
  { test: /^1[.)]$/, style: 'ordered' },
  { test: /^\[ ?\]$/, style: 'checklist' },
];

/**
 * The list a line of text asks for, or `null` when it asks for nothing. The text
 * is everything typed on the line so far — a marker only counts when it is the
 * whole line, so `2 * 3 ` stays arithmetic.
 */
export function markerStyle(text: string): ListStyle | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return MARKERS.find((m) => m.test.test(trimmed))?.style ?? null;
}

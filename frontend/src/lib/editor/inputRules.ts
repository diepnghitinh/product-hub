// The keys that make structure, in the two places people type: a block, and a
// table cell.
//
// Three gestures live here, and they are here rather than in the tools because
// the tools disagree about them:
//
//  · **`*` + space → a list** (`-`, `1.`, `[]` too). Editor.js has no input
//    rules at all, so a Notion habit typed into it left a literal asterisk.
//  · **Backspace at the start of a nested item → out one level.** The list tool
//    *deletes* the item instead, so an indented line could be typed but never
//    walked back — which is why documents end up with an empty bullet wrapped
//    around a child (`• ◦` on one line in the read view).
//  · **Enter inside a table cell → a line break.** The stock table adds a *row*,
//    so a cell could never hold two lines: everything typed after the break was
//    in a different row, and Backspace couldn't reach back across it. ⌘/Ctrl+Enter
//    keeps the row, since the toolbox is otherwise the only way to add one.
//
// Every rule works the same way: read the caret, decide from the text on the line,
// and either write the DOM directly (a cell holds HTML, so its lists are HTML) or
// hand the gesture to the tool that owns it (the list tool's own Shift+Tab).
import type EditorJS from '@editorjs/editorjs';
import { normalizeSpaces } from '@/lib/editorjs';
import {
  CELL_LIST_CLASS,
  cellListHtml,
  listBlockData,
  markerStyle,
  trimSeedPad,
} from './listMarkup';

/** A DOM position, as a range boundary. */
interface Point {
  node: Node;
  offset: number;
}

const elementOf = (node: Node | null | undefined): HTMLElement | null => {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
};

/** The caret — only a plain collapsed one; a selection belongs to the browser. */
function caretRange(): Range | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
}

function select(range: Range) {
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function placeCaret(node: Node, where: 'start' | 'end') {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(where === 'start');
  select(range);
}

function textBetween(start: Point, caret: Range): string | null {
  const range = document.createRange();
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(caret.startContainer, caret.startOffset);
  } catch {
    return null;
  }
  return range.toString();
}

/** Everything typed in `host` before the caret. `null` if the caret isn't in it. */
function textBefore(host: HTMLElement, caret: Range): string | null {
  if (!host.contains(caret.startContainer)) return null;
  return textBetween({ node: host, offset: 0 }, caret);
}

function fragmentHtml(fragment: DocumentFragment): string {
  const holder = document.createElement('div');
  holder.appendChild(fragment);
  return holder.innerHTML;
}

/**
 * Where the caret's *line* starts and ends inside `host`. A table cell keeps
 * several lines in one editable, separated by `<br>` — so "the start of the line"
 * is the last break before the caret, not the start of the cell.
 */
function lineBounds(host: HTMLElement, caret: Range): { start: Point; end: Point } {
  const start: Point = { node: host, offset: 0 };
  const end: Point = { node: host, offset: host.childNodes.length };
  for (const br of Array.from(host.querySelectorAll('br'))) {
    const parent = br.parentNode;
    if (!parent) continue;
    const index = Array.prototype.indexOf.call(parent.childNodes, br);
    const at = document.createRange();
    at.setStart(parent, index);
    at.collapse(true);
    if (at.compareBoundaryPoints(Range.START_TO_START, caret) < 0) {
      start.node = parent;
      start.offset = index + 1;
    } else {
      // The first break at or after the caret closes the line.
      end.node = parent;
      end.offset = index;
      break;
    }
  }
  return { start, end };
}

const isList = (el: Element | null | undefined): boolean =>
  !!el && (el.tagName === 'UL' || el.tagName === 'OL');

// ── Blocks ───────────────────────────────────────────────────────────────────

export interface BlockRuleConfig {
  editor: EditorJS;
  /** Tell the editor the document moved — these edits aren't its own. */
  onChange: () => void;
}

/**
 * Bind the block-level rules inside `holder`. Returns an unbind function.
 *
 * Capture, like every other key owner in this editor: Editor.js and the list tool
 * bind on the redactor inside this holder, so taking the key one level above is
 * what lets these run first. The `/` and `@` menus bind before this and stop the
 * keys they own, so an open menu still gets Enter and Tab to itself.
 */
export function bindBlockInputRules(holder: HTMLElement, config: BlockRuleConfig): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (e.key === ' ') startBlockList(e, config);
    else if (e.key === 'Backspace') outdentBlockItem(e, config);
  };
  // Non-breaking spaces come in with pasted prose (Google Docs joins words with
  // them), and a phrase held together by them is one unbreakable word to the
  // browser — which is why a pasted table cell broke `experience` mid-word
  // instead of wrapping. Ordinary spaces are the same width and the same length,
  // so rewriting them in place leaves every offset — and the caret — where it was.
  // After the browser has actually put the content in, and only telling the editor
  // when something was rewritten — a paste that needed nothing shouldn't count as
  // an edit of its own.
  const onPaste = () =>
    window.setTimeout(() => {
      if (normalizeSpaces(holder)) config.onChange();
    }, 0);
  holder.addEventListener('keydown', onKeyDown, true);
  holder.addEventListener('paste', onPaste, true);
  return () => {
    holder.removeEventListener('keydown', onKeyDown, true);
    holder.removeEventListener('paste', onPaste, true);
  };
}

/**
 * `* ` at the start of a paragraph turns it into a list. Only a paragraph, and
 * only when the marker is the whole line so far: `1.` in a heading is a heading
 * that starts with a number, and `2 * 3` is arithmetic.
 */
function startBlockList(e: KeyboardEvent, { editor, onChange }: BlockRuleConfig) {
  const caret = caretRange();
  if (!caret) return;
  const el = elementOf(caret.startContainer);
  if (!el || el.closest('input, textarea') || el.closest('.tc-cell')) return;
  const editable = el.closest<HTMLElement>('.ce-block [contenteditable="true"]');
  if (!editable) return;
  const index = editor.blocks.getCurrentBlockIndex();
  if (editor.blocks.getBlockByIndex(index)?.name !== 'paragraph') return;
  const before = textBefore(editable, caret);
  const style = before === null ? null : markerStyle(before);
  if (!style) return;
  e.preventDefault();
  e.stopPropagation();
  // Anything already typed past the caret rides along into the first item, so the
  // rule works on a line that was written before the marker was added to it.
  const rest = document.createRange();
  rest.setStart(caret.startContainer, caret.startOffset);
  rest.setEnd(editable, editable.childNodes.length);
  const carried = fragmentHtml(rest.cloneContents());
  // In this keystroke, not on the next tick — unlike the `/` menu, which inserts
  // from a click and can wait. The paragraph is *replaced* by the list, so a tick
  // spent waiting is a tick in which letters land in a block about to be thrown
  // away: typing `* Parent` quickly gave a bullet reading `ent`. Nothing here needs
  // the delay, because the key was taken in capture — Editor.js never sees it.
  try {
    editor.blocks.insert('list', listBlockData(style, carried), undefined, index, true, true);
    editor.caret.setToBlock(index, 'start');
  } catch {
    // A tool that refuses the data is not worth an exception in the page — the
    // paragraph is simply left as it was.
  }
  onChange();
}

/**
 * Backspace at the start of a *nested* item steps it back out one level, which is
 * how an indent gets undone by the key people already press. At the top level
 * nothing is taken: Backspace there still merges into the line above, and that's
 * the stock behaviour worth keeping.
 */
function outdentBlockItem(e: KeyboardEvent, { onChange }: BlockRuleConfig) {
  const caret = caretRange();
  if (!caret) return;
  const el = elementOf(caret.startContainer);
  if (!el || el.closest('.tc-cell')) return;
  const content = el.closest<HTMLElement>('.cdx-list__item-content');
  if (!content || textBefore(content, caret) !== '') return;
  const item = content.parentElement;
  if (!item?.parentElement?.classList.contains('cdx-list__item-children')) return;
  e.preventDefault();
  e.stopPropagation();
  // Handed to the list tool rather than re-implemented: it owns nesting — the
  // re-parenting, the numbering, its own model of the list — and Shift+Tab is
  // already its outdent. This is the same gesture, on a key that means it.
  content.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  onChange();
}

// ── Table cells ──────────────────────────────────────────────────────────────

export interface CellKeyConfig {
  onChange: () => void;
  /** Add a row under the caret's own — what ⌘/Ctrl+Enter keeps doing. */
  addRowBelow: () => void;
}

/**
 * Bind the cell rules on a table's wrapper. Bound there rather than to each cell
 * so they survive every add/delete row and column, and bound *after* the cell's
 * `/` menu so an open menu still owns Enter.
 */
export function bindCellKeys(wrap: HTMLElement, config: CellKeyConfig) {
  wrap.addEventListener(
    'keydown',
    (e) => {
      if (e.isComposing) return;
      const caret = caretRange();
      if (!caret) return;
      const cell = elementOf(caret.startContainer)?.closest<HTMLElement>('.tc-cell');
      if (!cell || !wrap.contains(cell)) return;
      if (e.key === 'Enter') cellEnter(e, cell, config);
      else if (e.key === ' ') cellStartList(e, cell, config);
      else if (e.key === 'Backspace') cellBackspace(e, cell, config);
    },
    true,
  );
}

function cellEnter(e: KeyboardEvent, cell: HTMLElement, { onChange, addRowBelow }: CellKeyConfig) {
  if (e.metaKey || e.ctrlKey) {
    // The stock gesture, moved onto a modifier: the toolbox is otherwise the only
    // way to add a row, and Tab in the last cell doesn't add one either.
    e.preventDefault();
    e.stopPropagation();
    addRowBelow();
    return;
  }
  // Shift+Enter already breaks the line — the stock table lets it through.
  if (e.shiftKey || e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  const caret = caretRange();
  const item = caret ? elementOf(caret.startContainer)?.closest<HTMLElement>('li') : null;
  if (item && cell.contains(item) && isList(item.parentElement)) splitItem(item, cell);
  else insertBreak();
  onChange();
}

function insertBreak() {
  // What a contenteditable does for Shift+Enter, including the trailing filler
  // that makes the new line land where you can see it. Only if the browser
  // doesn't have the command do we place the break ourselves.
  if (document.execCommand('insertLineBreak')) return;
  const caret = caretRange();
  if (!caret) return;
  const br = document.createElement('br');
  caret.insertNode(br);
  if (!br.nextSibling) br.after(document.createElement('br'));
  const next = document.createRange();
  next.setStartAfter(br);
  next.collapse(true);
  select(next);
}

/** Enter inside a cell's list: a new item, or — on an empty one — out of the list. */
function splitItem(item: HTMLElement, cell: HTMLElement) {
  const list = item.parentElement;
  const caret = caretRange();
  if (!list || !caret) return;
  if (!(item.textContent ?? '').replace(/\u00a0/g, ' ').trim()) return leaveList(item, list, cell);
  const next = document.createElement('li');
  if (item.hasAttribute('data-checked')) next.setAttribute('data-checked', 'false');
  const rest = document.createRange();
  rest.setStart(caret.startContainer, caret.startOffset);
  rest.setEnd(item, item.childNodes.length);
  next.appendChild(rest.extractContents());
  const pad = next.firstChild ? null : next.appendChild(document.createTextNode('\u00a0'));
  item.after(next);
  placeCaret(next, pad ? 'end' : 'start');
  trimSeedPad(cell, pad);
}

/** Enter on an empty item: the item goes, and the caret carries on under the list. */
function leaveList(item: HTMLElement, list: HTMLElement, cell: HTMLElement) {
  const host = list.parentNode;
  if (!host) return;
  item.remove();
  const pad = document.createTextNode('\u00a0');
  if (list.querySelector(':scope > li')) host.insertBefore(pad, list.nextSibling);
  else list.replaceWith(pad);
  placeCaret(pad, 'end');
  trimSeedPad(cell, pad);
}

/** `* ` in a cell. A cell has no blocks, so its list is inline HTML. */
function cellStartList(e: KeyboardEvent, cell: HTMLElement, { onChange }: CellKeyConfig) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const caret = caretRange();
  if (!caret) return;
  // Inside an item the markers are already there.
  if (elementOf(caret.startContainer)?.closest('li')) return;
  const { start } = lineBounds(cell, caret);
  const before = textBetween(start, caret);
  const style = before === null ? null : markerStyle(before);
  if (!style) return;
  e.preventDefault();
  e.stopPropagation();

  // The marker itself goes away…
  const marker = document.createRange();
  marker.setStart(start.node, start.offset);
  marker.setEnd(caret.startContainer, caret.startOffset);
  marker.deleteContents();
  // …and what's left of the line becomes the first item. The end of the line is
  // read *after* the deletion: removing the marker can take the node the old
  // boundary was counted against with it.
  const rest = document.createRange();
  rest.setStart(marker.startContainer, marker.startOffset);
  const { end } = lineBounds(cell, marker);
  rest.setEnd(end.node, end.offset);
  const carried = fragmentHtml(rest.extractContents()).trim();

  const fragment = rest.createContextualFragment(cellListHtml(style, carried || '&nbsp;'));
  const list = fragment.firstElementChild;
  rest.insertNode(fragment);
  const li = list?.querySelector('li') ?? null;
  if (li) {
    // *After* the padding when the item is empty: Chrome reads the start of an
    // element as a position before it and would type outside the list.
    placeCaret(li, carried ? 'start' : 'end');
    if (!carried) trimSeedPad(cell, li.firstChild);
  }
  onChange();
}

/**
 * Backspace at the start of a cell's list item. The first item unwraps — the line
 * stops being a list item and stays as text, which is what makes a list inside a
 * cell deletable at all. A later item merges into the one above, like any line.
 */
function cellBackspace(e: KeyboardEvent, cell: HTMLElement, { onChange }: CellKeyConfig) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const caret = caretRange();
  if (!caret) return;
  const item = elementOf(caret.startContainer)?.closest<HTMLElement>('li');
  const list = item?.parentElement ?? null;
  if (!item || !list || !cell.contains(item) || !isList(list)) return;
  if (textBefore(item, caret) !== '') return;
  e.preventDefault();
  e.stopPropagation();
  const previous = item.previousElementSibling as HTMLElement | null;
  if (previous) mergeIntoPrevious(item, previous);
  else unwrapItem(item, list, cell);
  onChange();
}

function mergeIntoPrevious(item: HTMLElement, previous: HTMLElement) {
  const join = previous.lastChild;
  while (item.firstChild) previous.appendChild(item.firstChild);
  item.remove();
  const range = document.createRange();
  if (join) range.setStartAfter(join);
  else range.setStart(previous, 0);
  range.collapse(true);
  select(range);
}

function unwrapItem(item: HTMLElement, list: HTMLElement, cell: HTMLElement) {
  const host = list.parentNode;
  if (!host) return;
  const line = document.createDocumentFragment();
  while (item.firstChild) line.appendChild(item.firstChild);
  const pad = line.firstChild ? null : line.appendChild(document.createTextNode('\u00a0'));
  const first = line.firstChild;
  item.remove();
  // The line was the first item, so it belongs above whatever is left of the list.
  if (list.querySelector(':scope > li')) host.insertBefore(line, list);
  else list.replaceWith(line);
  if (first) placeCaret(first, pad ? 'end' : 'start');
  trimSeedPad(cell, pad);
}

/** Re-exported so the table tool can label its own cell lists the same way. */
export { CELL_LIST_CLASS };

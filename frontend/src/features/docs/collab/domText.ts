/**
 * Counting characters the way a caret counts them.
 *
 * Both halves of collaborative editing need the same arithmetic: the binding
 * maps a caret across a remote edit so typing doesn't jump the cursor, and
 * presence maps *somebody else's* caret onto this window's DOM so it can be
 * drawn. Getting the two to disagree by one character is the classic way a
 * collaborative cursor ends up a letter off, so they share this file.
 *
 * The rule throughout: **text nodes only, in document order**. Markup is
 * invisible to the count — a word in bold is the same four characters whether
 * it's wrapped in a `<b>` or not, which is exactly what makes an offset
 * meaningful to another window whose markup may differ.
 */

/** An editable inside a block: a contenteditable, or a textarea for code and diagrams. */
export type TextHolder = HTMLElement | HTMLTextAreaElement;

export const isTextarea = (el: Element | null): el is HTMLTextAreaElement =>
  !!el && el.tagName === 'TEXTAREA';

/** The editables inside a block, in the order tools render them. */
export function textHolders(block: HTMLElement): TextHolder[] {
  return Array.from(block.querySelectorAll<TextHolder>('[contenteditable="true"], textarea'));
}

/** The block element a node sits in, or null when it isn't in one. */
export const blockElementOf = (node: Node | null): HTMLElement | null =>
  (node instanceof Element ? node : node?.parentElement)?.closest('.ce-block') ?? null;

/** The text of an element as the caret counts it. */
export function plainText(el: HTMLElement): string {
  let out = '';
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) out += walk.currentNode.nodeValue ?? '';
  return out;
}

/**
 * Where a DOM point sits inside `el`, in characters — or -1 if it isn't in it.
 *
 * Measured by cloning the range from the start of `el` to the point and
 * counting its text, rather than walking to the node: a selection boundary is
 * often given as *(element, child index)* rather than *(text node, character)*,
 * and the browser resolves that correctly where hand-written walking has to
 * special-case it.
 */
export function offsetOf(el: HTMLElement, node: Node | null, nodeOffset: number): number {
  if (!node || (node !== el && !el.contains(node))) return -1;
  const range = document.createRange();
  range.selectNodeContents(el);
  try {
    range.setEnd(node, nodeOffset);
  } catch {
    return -1;
  }
  const fragment = range.cloneContents();
  let length = 0;
  const walk = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) length += walk.currentNode.nodeValue?.length ?? 0;
  return length;
}

/** Where the caret is inside `el`, in characters, or -1 if it isn't in it. */
export function caretOffset(el: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return -1;
  const range = selection.getRangeAt(0);
  return offsetOf(el, range.endContainer, range.endOffset);
}

/**
 * The DOM point a character offset names.
 *
 * Never null: an offset past the end of the text lands at the end of it, which
 * is what both a restored caret and a peer's marker want when the block they
 * were in has since been shortened by somebody else.
 */
export function pointAt(el: HTMLElement, offset: number): { node: Node; offset: number } {
  let seen = 0;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const node = walk.currentNode;
    const length = node.nodeValue?.length ?? 0;
    if (seen + length >= offset) return { node, offset: Math.max(0, offset - seen) };
    seen += length;
  }
  // Nothing to land in — the block is empty. The element itself is the place.
  return { node: el, offset: el.childNodes.length };
}

export function setCaretOffset(el: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const point = pointAt(el, offset);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

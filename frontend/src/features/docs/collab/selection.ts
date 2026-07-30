/**
 * Somebody else's selection, as a place in the document rather than in the DOM.
 *
 * A caret can't be published as a DOM range — the other window's markup isn't
 * ours, and its nodes certainly aren't. What travels instead is a *document*
 * coordinate: which block, which editable inside it, and how many characters
 * in. Both ends of that are counted by `domText`, the same accounting the
 * binding uses to keep a local caret still across a remote edit, so a marker
 * lands on the character its owner is actually sitting on.
 *
 * It rides on awareness, never on the document: moving a caret or dragging a
 * selection costs one small broadcast, is never saved, and disappears when the
 * person does.
 */
import type EditorJS from '@editorjs/editorjs';
import { blockElementOf, isTextarea, offsetOf, textHolders } from './domText';

/** The awareness field carrying "where I am, and what I have selected". */
export const SELECTION_FIELD = 'sel';

/** One end of a selection. */
export interface CollabPoint {
  /** Editor.js block id — stable across windows, which is the whole point. */
  block: string;
  /** Which editable inside it: 0 for most tools, a cell for a table. */
  holder: number;
  /** Characters from the start of that editable, as the caret counts them. */
  offset: number;
}

export interface CollabSelection {
  /** Where the selection started — where the mouse went down. */
  anchor: CollabPoint;
  /** Where it ends, and where the caret is drawn. */
  head: CollabPoint;
}

export const samePoint = (a: CollabPoint, b: CollabPoint): boolean =>
  a.block === b.block && a.holder === b.holder && a.offset === b.offset;

export const sameSelection = (
  a: CollabSelection | null | undefined,
  b: CollabSelection | null | undefined,
): boolean =>
  a === b || (!!a && !!b && samePoint(a.anchor, b.anchor) && samePoint(a.head, b.head));

/** True when nothing is selected — a plain caret rather than a range. */
export const isCaret = (selection: CollabSelection): boolean =>
  samePoint(selection.anchor, selection.head);

/** The block and editable a DOM node belongs to, or null when it belongs to none. */
function locate(
  editor: EditorJS,
  root: HTMLElement,
  node: Node | null,
): { block: string; holder: number; element: HTMLElement } | null {
  if (!node || !root.contains(node)) return null;
  const element = blockElementOf(node);
  if (!element) return null;
  const id = editor.blocks.getBlockByElement(element)?.id;
  if (!id) return null;
  const holders = textHolders(element);
  const index = holders.findIndex((h) => h === node || h.contains(node));
  if (index < 0) return null;
  return { block: id, holder: index, element: holders[index] as HTMLElement };
}

const pointOf = (
  editor: EditorJS,
  root: HTMLElement,
  node: Node | null,
  nodeOffset: number,
): CollabPoint | null => {
  const at = locate(editor, root, node);
  if (!at) return null;
  const offset = offsetOf(at.element, node, nodeOffset);
  return offset < 0 ? null : { block: at.block, holder: at.holder, offset };
};

/** This window's selection, ready to publish — or null when the caret is elsewhere. */
export function readSelection(editor: EditorJS, root: HTMLElement): CollabSelection | null {
  // A textarea (a code block, a diagram) is not described by the document
  // selection at all, so it has to be asked directly. It's also why a point
  // records its holder: its own value is the text, and nothing else in the
  // block counts.
  const active = document.activeElement;
  if (isTextarea(active) && root.contains(active)) {
    const at = locate(editor, root, active);
    if (!at) return null;
    const where = { block: at.block, holder: at.holder };
    return {
      anchor: { ...where, offset: active.selectionStart ?? 0 },
      head: { ...where, offset: active.selectionEnd ?? 0 },
    };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const anchor = pointOf(editor, root, selection.anchorNode, selection.anchorOffset);
  const head = pointOf(editor, root, selection.focusNode, selection.focusOffset);
  return anchor && head ? { anchor, head } : null;
}

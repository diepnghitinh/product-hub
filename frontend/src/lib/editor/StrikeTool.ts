// Strikethrough — the one mark the inline toolbar was missing.
//
// Written rather than installed: the published tools each pick their own tag
// (`<strike>`, `<del>`, a `<span>` with a class), and this editor stores plain
// HTML, so the tag *is* the format. `<s>` is the one `lib/editorjs` already round-
// trips and the one every read view underlines-through without a line of CSS.
//
// The toggle is a module function, not just a method, because two things reach
// for it: the toolbar button, and the keyboard (`inlineShortcuts`). Both must do
// exactly the same thing to the same selection.
import type { API, InlineTool } from '@editorjs/editorjs';
import { t } from '@/i18n';

const ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/></svg>';

/** The `<s>` the caret sits in, if any. */
function currentStrike(): HTMLElement | null {
  const node = window.getSelection()?.anchorNode;
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement;
  return el?.closest<HTMLElement>('s') ?? null;
}

/** Put the strike back where it was taken from, so the text stays selected. */
function unwrap(el: HTMLElement, sel: Selection) {
  const parent = el.parentNode;
  if (!parent) return;
  const inner = document.createRange();
  inner.selectNodeContents(el);
  const contents = inner.extractContents();
  const first = contents.firstChild;
  const last = contents.lastChild;
  parent.replaceChild(contents, el);
  if (!first || !last) return;
  const next = document.createRange();
  next.setStartBefore(first);
  next.setEndAfter(last);
  sel.removeAllRanges();
  sel.addRange(next);
}

/**
 * Strike the selection, or un-strike the run the caret is in. A collapsed caret
 * outside a strike does nothing — there is no "start typing struck-through" state
 * to keep, and silently arming one would surprise the next word typed.
 */
export function toggleStrikethrough(): void {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const existing = currentStrike();
  if (existing) return unwrap(existing, sel);
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  const s = document.createElement('s');
  s.appendChild(range.extractContents());
  range.insertNode(s);
  const next = document.createRange();
  next.selectNodeContents(s);
  sel.removeAllRanges();
  sel.addRange(next);
}

/** `<s>` from the inline toolbar, and from ⌘/Ctrl+Shift+X. */
export class StrikeTool implements InlineTool {
  static isInline = true;

  static get title() {
    return t('editor.strikethrough');
  }

  /** Editor.js reads `CMD` as ⌘ *or* Ctrl, so this is one shortcut on both. */
  static get shortcut() {
    return 'CMD+SHIFT+X';
  }

  static get sanitize() {
    return { s: {} };
  }

  private readonly api: API;
  private button: HTMLButtonElement | null = null;

  constructor({ api }: { api: API }) {
    this.api = api;
  }

  render(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add(this.api.styles.inlineToolButton);
    button.innerHTML = ICON;
    button.title = t('editor.strikethrough');
    this.button = button;
    return button;
  }

  surround() {
    toggleStrikethrough();
  }

  checkState(): boolean {
    const on = !!currentStrike();
    this.button?.classList.toggle(this.api.styles.inlineToolButtonActive, on);
    return on;
  }
}

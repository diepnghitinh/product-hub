// "Add a line above this one" — for the blocks you can't put a caret in.
//
// An image, a video, a divider and a diagram have no editable text, so there is
// no line to press Home and Enter on. When one of those is the first thing in a
// document, or sits directly under another one, there was no way to write above
// it at all: clicking it only selects it, and the next keystroke then *replaces*
// the block. The gesture people expect (a `+` on the seam between two blocks) is
// what this adds, and only where it is actually needed.
//
// The strip lives on `document.body`, for the same two reasons the `/` menu does:
// a node inside a block gets read back as that block's content, and
// `.report-workspace` redefines the colour tokens — at body level the accent is
// always the app's. Positioned `fixed` against the block's own box, because the
// editor's holder is not a positioning context.
import type EditorJS from '@editorjs/editorjs';
import { t } from '@/i18n';

const PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`;

export interface InsertLineConfig {
  editor: EditorJS;
  onChange: () => void;
}

/** A block with nothing to type into — an image, a divider, a diagram. */
const textless = (block: HTMLElement): boolean =>
  !block.querySelector('[contenteditable="true"], textarea');

export function bindInsertLine(holder: HTMLElement, { editor, onChange }: InsertLineConfig) {
  let strip: HTMLButtonElement | null = null;
  let target: HTMLElement | null = null;

  const hide = () => {
    strip?.remove();
    strip = null;
    target = null;
  };

  /** Over the top edge of the block, spanning the same width as its content. */
  const position = () => {
    if (!strip || !target) return;
    const box = (target.querySelector('.ce-block__content') ?? target).getBoundingClientRect();
    strip.style.left = `${Math.round(box.left)}px`;
    strip.style.width = `${Math.round(box.width)}px`;
    strip.style.top = `${Math.round(box.top - 9)}px`;
  };

  const insertAbove = () => {
    const block = target;
    if (!block) return;
    const index = Array.from(
      holder.querySelectorAll<HTMLElement>('.codex-editor__redactor > .ce-block'),
    ).indexOf(block);
    hide();
    if (index < 0) return;
    try {
      editor.blocks.insert('paragraph', undefined, undefined, index, true);
      editor.caret.setToBlock(index, 'start');
    } catch {
      // Nothing was inserted, so there is nothing to undo — and an editor that
      // throws while you hover a picture is worse than a missing line.
      return;
    }
    onChange();
  };

  const show = (block: HTMLElement) => {
    target = block;
    if (!strip) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'rte-insert-line';
      el.setAttribute('contenteditable', 'false');
      el.title = t('editor.insertLineAbove');
      el.setAttribute('aria-label', t('editor.insertLineAbove'));
      el.innerHTML = `<span class="rte-insert-line__plus">${PLUS}</span>`;
      // The button is outside the editor, so a press on it must not take the
      // selection with it — Editor.js inserts relative to the block it thinks is
      // current.
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', insertAbove);
      document.body.appendChild(el);
      strip = el;
    }
    position();
  };

  // One listener for the whole document rather than enter/leave pairs on the
  // holder: the strip overlaps the seam above the block, so a pointer moving onto
  // it leaves the block — and asking "what is under the pointer now?" is the only
  // version of this that doesn't flicker.
  const onPointerOver = (e: Event) => {
    const node = e.target as HTMLElement | null;
    if (strip && node && strip.contains(node)) return;
    const block = node?.closest?.<HTMLElement>('.ce-block') ?? null;
    if (!block || !holder.contains(block) || !textless(block)) return hide();
    show(block);
  };
  // Follow the block instead of vanishing: the strip is positioned against the
  // viewport, so a scroll is the one case where it would otherwise drift away
  // from what it belongs to.
  const onScroll = () => position();

  document.addEventListener('pointerover', onPointerOver, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  return () => {
    document.removeEventListener('pointerover', onPointerOver, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    hide();
  };
}

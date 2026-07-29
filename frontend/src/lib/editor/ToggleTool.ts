// A toggle: a headline you can fold a passage away behind. Notion's disclosure
// block, and the reason a long doc can stay skimmable — FAQ answers, "why we
// decided this", the detail nobody needs on the first read.
//
// Stored as `<details><summary>…</summary><div>…</div></details>`, which is the
// element the platform already has for this. That choice does the work: the read
// view and the public share page open and close it with **no JavaScript at all**,
// and a doc printed or exported to PDF still holds the text.
//
// Scope, stated plainly: the body holds formatted text and line breaks — bold,
// links, code, mentions, `Enter` for a new line. It is not a nested editor, so a
// table or an image can't live inside a toggle. Editor.js has no supported way to
// nest blocks, and the alternatives (adopting the *following* blocks as
// children) break the moment someone drags a block or the page reloads.
import type { BlockAPI, HTMLPasteEvent, PasteEvent } from '@editorjs/editorjs';
import { t } from '@/i18n';
import { INLINE_SANITIZE } from './sanitize';

export interface ToggleData {
  /** The always-visible headline. */
  summary: string;
  /** What's hidden behind it. */
  text: string;
  /** Whether it starts open — the author's choice, saved with the page. */
  open: boolean;
}

const TOOLBOX_ICON =
  '<svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 5 5 4-5 4"/><path d="M14 9h6"/><path d="M4 17h16"/></svg>';

export class ToggleTool {
  static get toolbox() {
    return { title: t('editor.blockToggle'), icon: TOOLBOX_ICON };
  }
  static get isReadOnlySupported() {
    return true;
  }
  /**
   * Enter belongs to the toggle, not to Editor.js's "start a new block": in the
   * headline it moves you into the body, and in the body it starts a new line.
   */
  static get enableLineBreaks() {
    return true;
  }
  /** Only the two text fields are listed — the sanitizer walks strings, and
   *  `open` is a boolean it never looks at. */
  static get sanitize() {
    return { summary: INLINE_SANITIZE, text: INLINE_SANITIZE };
  }
  /** Paste a `<details>` — from another doc, or from a page — and it stays one. */
  static get pasteConfig() {
    return { tags: ['DETAILS'] };
  }

  private data: ToggleData;
  private readOnly: boolean;
  private block?: BlockAPI;
  private details: HTMLDetailsElement;
  private title: HTMLElement;
  private body: HTMLElement;

  constructor({
    data,
    readOnly,
    block,
  }: {
    data?: Partial<ToggleData>;
    readOnly?: boolean;
    block?: BlockAPI;
  }) {
    this.data = {
      summary: data?.summary ?? '',
      text: data?.text ?? '',
      // A new toggle starts open — you've just made it to put something in it.
      open: data?.open ?? true,
    };
    this.readOnly = !!readOnly;
    this.block = block;
    this.details = document.createElement('details');
    this.title = document.createElement('span');
    this.body = document.createElement('div');
  }

  render(): HTMLElement {
    const editable = !this.readOnly;
    this.details.className = 'rte-toggle';
    this.details.open = this.data.open;

    const summary = document.createElement('summary');
    summary.className = 'rte-toggle__summary';
    this.title.className = 'rte-toggle__title';
    this.title.dataset.placeholder = t('editor.togglePlaceholder');
    this.title.innerHTML = this.data.summary;
    if (editable) this.title.contentEditable = 'true';
    summary.appendChild(this.title);

    this.body.className = 'rte-toggle__body';
    this.body.dataset.placeholder = t('editor.toggleBodyPlaceholder');
    this.body.innerHTML = this.data.text;
    if (editable) this.body.contentEditable = 'true';

    this.details.append(summary, this.body);

    if (editable) {
      // Clicking the headline puts the caret in it. Only the marker folds the
      // block — otherwise every attempt to fix a typo would collapse the thing
      // you were reading.
      summary.addEventListener('click', (e) => {
        if (this.title.contains(e.target as Node)) e.preventDefault();
      });
      // Space and Enter on a focused <summary> are the native toggle keys, which
      // would make the headline untypable.
      this.title.addEventListener('keydown', (e) => this.onTitleKey(e));
      this.body.addEventListener('keydown', (e) => this.onBodyKey(e));
      // Folded state is the author's, so it has to be saved — and nothing else
      // marks the page dirty when all you did was fold something away.
      this.details.addEventListener('toggle', () => {
        if (this.details.open !== this.data.open) {
          this.data.open = this.details.open;
          this.block?.dispatchChange?.();
        }
      });
    }
    return this.details;
  }

  /** Enter drops into the body (opening the toggle if it was folded). */
  private onTitleKey(e: KeyboardEvent) {
    if (e.key === ' ') {
      e.stopPropagation();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    this.details.open = true;
    this.body.focus();
    // The caret goes to the end of whatever is already there.
    const range = document.createRange();
    range.selectNodeContents(this.body);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  /**
   * A line break, not a `<div>`: `contenteditable` wraps each new line in one by
   * default, and `div` isn't on the whitelist — so the body would lose its shape
   * on the very next save.
   */
  private onBodyKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    document.execCommand('insertLineBreak');
  }

  onPaste(event: PasteEvent): void {
    // `pasteConfig.tags` means only a `<details>` gets here; the cast is the
    // narrowing Editor.js's union can't express.
    const el = (event as HTMLPasteEvent).detail?.data;
    if (!el) return;
    const summary = el.querySelector('summary');
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelector('summary')?.remove();
    this.data = {
      summary: summary?.innerHTML ?? '',
      text: clone.innerHTML.trim(),
      open: el.hasAttribute('open'),
    };
    this.title.innerHTML = this.data.summary;
    this.body.innerHTML = this.data.text;
    this.details.open = this.data.open;
  }

  save(): ToggleData {
    return {
      summary: this.title.innerHTML.trim(),
      text: this.body.innerHTML.trim(),
      open: this.details.open,
    };
  }

  /** A toggle with neither a headline nor anything behind it is dropped. */
  validate(data: ToggleData): boolean {
    const has = (v: string) => !!v?.replace(/<br\s*\/?>/gi, '').trim();
    return has(data.summary) || has(data.text);
  }
}

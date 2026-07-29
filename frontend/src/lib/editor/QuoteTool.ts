// A pull quote — one indented passage with a rule down its left edge. Stored as
// the markup it already is (`<blockquote>`, see `lib/editorjs.ts`), so a quote
// looks the same in the editor, in a read view and on a public share page.
//
// Deliberately no caption/attribution field: `@editorjs/quote` offers one, and
// it leaves every quote with a second empty line to tab past. A source belongs
// in the sentence, or in a link.
import type { HTMLPasteEvent, PasteEvent } from '@editorjs/editorjs';
import { t } from '@/i18n';
import { INLINE_SANITIZE } from './sanitize';

export interface QuoteData {
  text: string;
}

const TOOLBOX_ICON =
  '<svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v2a2 2 0 0 1-2 2"/><path d="M20 6h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v2a2 2 0 0 1-2 2"/></svg>';

export class QuoteTool {
  static get toolbox() {
    return { title: t('editor.blockQuote'), icon: TOOLBOX_ICON };
  }
  static get isReadOnlySupported() {
    return true;
  }
  static get sanitize() {
    return { text: INLINE_SANITIZE };
  }
  /** Lets the block menu turn a paragraph into a quote and back again. */
  static get conversionConfig() {
    return { export: 'text', import: 'text' };
  }
  /** Paste a `<blockquote>` and it lands here rather than flattening to a paragraph. */
  static get pasteConfig() {
    return { tags: ['BLOCKQUOTE'] };
  }

  private data: QuoteData;
  private readOnly: boolean;
  private el: HTMLElement;

  constructor({ data, readOnly }: { data?: Partial<QuoteData>; readOnly?: boolean }) {
    this.data = { text: data?.text ?? '' };
    this.readOnly = !!readOnly;
    this.el = document.createElement('blockquote');
  }

  render(): HTMLElement {
    this.el.className = 'rte-quote';
    // Editor.js needs a contenteditable to put the caret in; the placeholder is
    // drawn from this attribute by CSS, the way an empty paragraph gets one.
    if (!this.readOnly) this.el.contentEditable = 'true';
    this.el.dataset.placeholder = t('editor.quotePlaceholder');
    this.el.innerHTML = this.data.text;
    return this.el;
  }

  onPaste(event: PasteEvent): void {
    // Only `pasteConfig.tags` reach this tool, so the detail is always the
    // element form — the cast is the type narrowing Editor.js can't express.
    const html = (event as HTMLPasteEvent).detail?.data?.innerHTML ?? '';
    this.data = { text: html };
    this.el.innerHTML = html;
  }

  save(el: HTMLElement): QuoteData {
    return { text: el.innerHTML.trim() };
  }

  /** An empty quote is dropped rather than stored as a blank indented line. */
  validate(data: QuoteData): boolean {
    return !!data.text?.replace(/<br\s*\/?>/gi, '').trim();
  }
}

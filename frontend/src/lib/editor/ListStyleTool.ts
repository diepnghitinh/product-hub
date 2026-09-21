// "Numbered" / "Bulleted" — swap a list's style from its own inline toolbar,
// same popup that already offers bold/italic on a selection. A list is one
// block no matter how many lines it has (@editorjs/list stores every item in
// one `items` array), so this always rewrites the whole list in a single
// `blocks.update()` call — whether the selection covers one line or all five.
//
// Both tools are registered globally like every other inline tool here
// (marker, underline, comment, …), so `checkState()` is what keeps them out of
// a heading's or a quote's toolbar: it hides the button whenever the caret
// isn't inside an `<ol>`/`<ul>`, the same way StrikeTool toggles its own
// active state from the live selection instead of editor state.
import type { API, InlineTool } from '@editorjs/editorjs';
import { t } from '@/i18n';

type Style = 'ordered' | 'unordered';

/** The `<ol>`/`<ul>` the caret sits in, if any. */
function currentList(): HTMLElement | null {
  const node = window.getSelection()?.anchorNode;
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement;
  return el?.closest<HTMLElement>('ol, ul') ?? null;
}

/** Rewrite the current block's `style` — a no-op if it's already this style. */
async function applyListStyle(api: API, style: Style): Promise<void> {
  const block = api.blocks.getBlockByIndex(api.blocks.getCurrentBlockIndex());
  if (!block || block.name !== 'list') return;
  const saved = (await block.save().catch(() => null)) as { data?: Record<string, unknown> } | null;
  const data = saved?.data;
  if (!data || data.style === style) return;
  await api.blocks.update(block.id, { ...data, style });
}

const ORDERED_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>';

const UNORDERED_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>';

/** Switch the current list to numbered. */
export class ListOrderedTool implements InlineTool {
  static isInline = true;

  static get title() {
    return t('editor.slashNumbered');
  }

  static get sanitize() {
    return {};
  }

  private readonly api: API;
  private button: HTMLButtonElement | null = null;

  constructor({ api }: { api: API }) {
    this.api = api;
  }

  render(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.hidden = true;
    button.classList.add(this.api.styles.inlineToolButton);
    button.innerHTML = ORDERED_ICON;
    button.title = t('editor.slashNumbered');
    this.button = button;
    return button;
  }

  surround(): void {
    void applyListStyle(this.api, 'ordered');
  }

  checkState(): boolean {
    const list = currentList();
    const on = list?.tagName === 'OL';
    if (this.button) this.button.hidden = !list;
    this.button?.classList.toggle(this.api.styles.inlineToolButtonActive, on);
    return on;
  }
}

/** Switch the current list to bulleted. */
export class ListUnorderedTool implements InlineTool {
  static isInline = true;

  static get title() {
    return t('editor.slashBullet');
  }

  static get sanitize() {
    return {};
  }

  private readonly api: API;
  private button: HTMLButtonElement | null = null;

  constructor({ api }: { api: API }) {
    this.api = api;
  }

  render(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.hidden = true;
    button.classList.add(this.api.styles.inlineToolButton);
    button.innerHTML = UNORDERED_ICON;
    button.title = t('editor.slashBullet');
    this.button = button;
    return button;
  }

  surround(): void {
    void applyListStyle(this.api, 'unordered');
  }

  checkState(): boolean {
    const list = currentList();
    const on = list?.tagName === 'UL';
    if (this.button) this.button.hidden = !list;
    this.button?.classList.toggle(this.api.styles.inlineToolButtonActive, on);
    return on;
  }
}

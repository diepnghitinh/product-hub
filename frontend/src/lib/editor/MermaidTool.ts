// An Editor.js block for Mermaid diagrams. Only the diagram *source* is stored
// (see the `mermaid` block in `lib/editorjs.ts`), so a diagram stays editable
// text forever rather than becoming a flat image nobody can amend.
//
// The block has two faces: a textarea you type the diagram into, and the drawn
// SVG. It shows the picture once the source parses, and flips back to the
// textarea when you click it — the same "click to edit, click away to see"
// rhythm as the rest of the editor.
import { renderMermaid, stripMermaidFence } from '@/lib/mermaid';

export interface MermaidData {
  code: string;
}

const TOOLBOX_ICON =
  '<svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="16" width="7" height="5" rx="1"/><path d="M6.5 8v4a2 2 0 0 0 2 2h9"/><path d="M17.5 8v6"/></svg>';

/** What a new block starts with — a diagram you can read before you can type. */
const PLACEHOLDER = `flowchart TD
  A[Idea] --> B{Worth building?}
  B -- yes --> C[Discovery]
  B -- no --> D[Park it]`;

export class MermaidTool {
  static get toolbox() {
    return { title: 'Diagram', icon: TOOLBOX_ICON };
  }
  static get isReadOnlySupported() {
    return true;
  }
  /** Diagram source is plain text with newlines — Editor.js must not sanitize it. */
  static get sanitize() {
    return { code: false };
  }
  /** Paste a fenced ```mermaid block and it lands here rather than as a code block. */
  static get pasteConfig() {
    return { tags: ['pre'] };
  }

  private data: MermaidData;
  private readOnly: boolean;
  private wrapper: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private preview: HTMLElement;
  private editing = false;

  constructor({ data, readOnly }: { data?: MermaidData; readOnly?: boolean }) {
    this.data = { code: data?.code || '' };
    this.readOnly = !!readOnly;
    this.wrapper = document.createElement('div');
    this.textarea = document.createElement('textarea');
    this.preview = document.createElement('div');
  }

  render(): HTMLElement {
    this.wrapper.className = 'mermaid-tool';

    this.textarea.className = 'mermaid-tool-source';
    this.textarea.value = this.data.code || PLACEHOLDER;
    this.textarea.spellcheck = false;
    this.textarea.readOnly = this.readOnly;
    this.textarea.setAttribute('aria-label', 'Mermaid diagram source');
    this.textarea.rows = 6;
    // Enter belongs to the diagram, not to Editor.js's "new block" handling.
    this.textarea.addEventListener('keydown', (e) => e.stopPropagation());
    this.textarea.addEventListener('input', () => {
      this.data.code = this.textarea.value;
      this.autoGrow();
    });
    // Leaving the source shows the picture — no "render" button to hunt for.
    this.textarea.addEventListener('blur', () => this.show());

    this.preview.className = 'mermaid-tool-preview';
    this.preview.addEventListener('click', () => {
      if (!this.readOnly) this.edit();
    });

    this.wrapper.append(this.textarea, this.preview);
    // Start on the picture: an existing diagram is there to be read, and a new
    // one starts from the placeholder, which already draws.
    this.show();
    return this.wrapper;
  }

  /** Keep the source box the height of its content — no inner scrollbar. */
  private autoGrow() {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = `${this.textarea.scrollHeight}px`;
  }

  private edit() {
    this.editing = true;
    this.wrapper.classList.add('is-editing');
    this.textarea.focus();
    this.autoGrow();
  }

  /** Draw the current source. Failures print mermaid's own message. */
  private show() {
    this.editing = false;
    this.wrapper.classList.remove('is-editing');
    const code = this.textarea.value;
    void renderMermaid(code)
      .then((svg) => {
        // Ignore a render that finished after the user went back to typing.
        if (this.editing) return;
        this.preview.innerHTML = svg;
        this.wrapper.classList.remove('has-error');
      })
      .catch((e: Error) => {
        if (this.editing) return;
        this.preview.textContent = e.message || 'Could not draw this diagram';
        this.wrapper.classList.add('has-error');
      });
  }

  /** A pasted ```mermaid fence becomes a diagram; any other <pre> is left alone. */
  onPaste(event: { type: string; detail: { data?: HTMLElement } }): void {
    const text = event.detail?.data?.textContent ?? '';
    if (!/^\s*```mermaid/i.test(text)) return;
    this.data.code = stripMermaidFence(text);
    this.textarea.value = this.data.code;
    this.show();
  }

  save(): MermaidData {
    return { code: stripMermaidFence(this.textarea.value) };
  }

  /** An empty diagram is dropped rather than stored as a blank figure. */
  validate(data: MermaidData): boolean {
    return !!data.code?.trim();
  }
}

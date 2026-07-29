// A horizontal rule between sections. `@editorjs/delimiter` draws three centred
// asterisks; a divider is a line, so this is ~20 lines instead of a dependency —
// and it stores as `<hr>`, which every view already knows how to paint.
import { t } from '@/i18n';

const TOOLBOX_ICON =
  '<svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h18"/><path d="M7 7h10" opacity=".35"/><path d="M7 17h10" opacity=".35"/></svg>';

export class DividerTool {
  static get toolbox() {
    return { title: t('editor.blockDivider'), icon: TOOLBOX_ICON };
  }
  static get isReadOnlySupported() {
    return true;
  }
  /** No text of its own — there is nothing here for the sanitizer to walk. */
  static get sanitize() {
    return {};
  }

  render(): HTMLElement {
    // The `<hr>` is wrapped rather than returned bare: Editor.js gives the block
    // its own click/selection handling, and a wrapper gives the thin line a
    // comfortable target to click and a place for the selected-block highlight.
    const wrap = document.createElement('div');
    wrap.className = 'rte-divider';
    wrap.appendChild(document.createElement('hr'));
    return wrap;
  }

  save(): Record<string, never> {
    return {};
  }
}

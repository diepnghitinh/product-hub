/**
 * "Comment" in the editor's inline toolbar — select a passage, hit the bubble,
 * write a note about it.
 *
 * An inline tool normally *surrounds* the selection with markup, and this one
 * deliberately doesn't. Whatever it wrapped the text in would be saved into the
 * page's HTML on the next autosave and travel into the version history and the
 * public share link — a comment would be editing the document it's about. So
 * `surround()` only hands the range up; the highlight is painted as an overlay
 * from the anchor the caller derives (see `lib/textAnchor.ts`).
 */

export interface CommentToolConfig {
  /** Called with the selected range. Never mutated, so it's safe to keep. */
  onComment?: (range: Range) => void;
  /** Button tooltip — passed in so the tool needs no i18n import of its own. */
  title?: string;
}

const ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

export class CommentTool {
  static get isInline() {
    return true;
  }

  static get title() {
    return 'Comment';
  }

  /** Adds no markup, so it whitelists none. */
  static get sanitize() {
    return {};
  }

  private readonly config: CommentToolConfig;

  constructor({ config }: { config?: CommentToolConfig } = {}) {
    this.config = config ?? {};
  }

  render(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('ce-inline-tool');
    button.innerHTML = ICON;
    if (this.config.title) button.title = this.config.title;
    return button;
  }

  surround(range: Range): void {
    // Cloned: Editor.js closes the toolbar right after this, and closing moves
    // the live selection — the caller would otherwise be handed an empty range.
    this.config.onComment?.(range.cloneRange());
  }

  /** Never "on": there's no state in the text to read it back from. */
  checkState(): boolean {
    return false;
  }
}

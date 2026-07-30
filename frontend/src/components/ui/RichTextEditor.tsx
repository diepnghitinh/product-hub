import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Marker from '@editorjs/marker';
import InlineCode from '@editorjs/inline-code';
import Underline from '@editorjs/underline';
import CodeTool from '@editorjs/code';
import Undo from 'editorjs-undo';
import { blocksToHtml, htmlToBlocks, type HtmlEditorBlock } from '@/lib/editorjs';
import { enhanceCodeBlocks } from '@/lib/enhanceCodeBlocks';
import { ResizableImageTool } from '@/lib/editor/ResizableImageTool';
import { ResizableTableTool } from '@/lib/editor/ResizableTableTool';
import { MermaidTool } from '@/lib/editor/MermaidTool';
import { QuoteTool } from '@/lib/editor/QuoteTool';
import { ToggleTool } from '@/lib/editor/ToggleTool';
import { DividerTool } from '@/lib/editor/DividerTool';
import { MentionMenu } from '@/lib/editor/MentionMenu';
import { SlashMenu } from '@/lib/editor/SlashMenu';
import { StrikeTool } from '@/lib/editor/StrikeTool';
import { bindInlineShortcuts } from '@/lib/editor/inlineShortcuts';
import { bindInsertLine } from '@/lib/editor/insertLine';
import { bindBlockInputRules } from '@/lib/editor/inputRules';
import { CommentTool } from '@/lib/editor/CommentTool';
import { uploadMedia } from '@/features/uploads/api';
import { useUsers } from '@/features/users/api';
import type { SlashPerson } from '@/lib/editor/SlashMenu';
import { t } from '@/i18n';
import '@/styles/rich-text-editor.css';
import { useExternalLink } from './ExternalLink';
import { useImageZoom } from './ImageZoom';

/** A block to mount the editor with, ids included. */
export interface EditorBlockSeed {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

export interface RichTextEditorProps {
  /** Stored value as HTML (converted to/from Editor.js blocks internally). */
  value: string;
  onChange: (html: string) => void;
  /**
   * Mount with these blocks instead of parsing `value`.
   *
   * For the one caller that has block ids worth keeping: the collaborative doc
   * body hands over the CRDT's blocks, so the ids every client shares are the
   * ones Editor.js — and its undo history — hold from the first frame. Without
   * it, the first undo would restore blocks under ids nobody else knows.
   */
  initialBlocks?: EditorBlockSeed[];
  placeholder?: string;
  minHeight?: number;
  /**
   * Enable image + short-video blocks. Media uploads to the workspace's
   * configured storage (Settings → Storage); with none set up, images fall back
   * to an inline base64 data URL. Off by default to keep plain descriptions light.
   */
  images?: boolean;
  /**
   * Enable the Mermaid diagram block. The mermaid library is ~500KB and only
   * loads once a diagram is actually drawn, but the tool still adds an entry to
   * every block menu — so it's opt-in, for long-form surfaces like a doc page.
   */
  diagrams?: boolean;
  /**
   * Short-form mode, for a comment box rather than a document: paragraphs,
   * lists, code and the full inline toolbar (bold / italic / link / underline /
   * highlight / inline code), but no headings and no tables. Structure that
   * belongs in a doc only gets in the way in a two-line reply.
   */
  minimal?: boolean;
  /**
   * Offer `@` mentions. Inserts the same `rte-mention` chip the table cell's `/`
   * menu does, which `mentionIdsFromHtml` reads back out to notify people.
   */
  mentions?: boolean;
  /**
   * Who can be mentioned. Defaults to the workspace's members; pass a list when
   * the surface scopes it (a comment thread offers the people it was handed).
   */
  people?: SlashPerson[];
  /** Put the caret in the editor once it's ready — for a box opened to be typed in. */
  autoFocus?: boolean;
  /**
   * Offer "Comment" in the inline toolbar. Called with the selected range; the
   * tool adds no markup of its own, so what the caller does with it (an anchor,
   * an overlay highlight) never touches the saved HTML.
   */
  onComment?: (range: Range) => void;
  /** Tooltip for that button — the editor has no opinion on the wording. */
  commentLabel?: string;
  /**
   * The Editor.js instance, once it's up. For a caller that has to drive the
   * editor rather than just read its HTML — the collaborative doc body binds it
   * to a CRDT (see `features/docs/collab`). Called once per mount, and again
   * with `null` when that instance goes away.
   */
  onReady?: (editor: EditorJS | null) => void;
  className?: string;
}

/**
 * The heading levels the block menu offers, one entry each. Titles are read
 * through a function, not stored: the menu is built when the editor mounts, and
 * a module-level string would be baked in at import time — before the locale is.
 */
const HEADINGS: Array<{ level: number; title: () => string }> = [
  { level: 1, title: () => t('editor.blockHeading1') },
  { level: 2, title: () => t('editor.blockHeading2') },
  { level: 3, title: () => t('editor.blockHeading3') },
  { level: 4, title: () => t('editor.blockHeading4') },
];

/** "H1"…"H4" — the level *is* the icon, so the four entries can't be confused. */
const headingIcon = (level: number) =>
  `<svg width="17" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><text x="12" y="18" text-anchor="middle" font-size="15" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif">H${level}</text></svg>`;

/**
 * A minimal Editor.js block for short videos: pick a file → upload to storage →
 * <video>. Self-contained (calls the upload endpoint directly) and inline-styled
 * so it needs no extra CSS. Only offered when the editor's `images` prop is on.
 */
class VideoTool {
  static get toolbox() {
    return {
      title: t('editor.blockVideo'),
      icon: '<svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="16" rx="2"/><path d="M16 9l6-3v12l-6-3"/></svg>',
    };
  }

  private data: { url?: string };

  constructor({ data }: { data?: { url?: string } }) {
    this.data = data || {};
  }

  render(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.margin = '0.6em 0';
    if (this.data.url) this.renderPlayer(wrapper);
    else this.renderPicker(wrapper);
    return wrapper;
  }

  private renderPlayer(wrapper: HTMLElement) {
    wrapper.innerHTML = '';
    const video = document.createElement('video');
    video.src = this.data.url as string;
    video.controls = true;
    video.style.cssText = 'width:100%;border-radius:8px;display:block';
    wrapper.appendChild(video);
  }

  private renderPicker(wrapper: HTMLElement) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = t('editor.selectVideo');
    btn.style.cssText =
      'width:100%;padding:14px;border:1px dashed hsl(var(--border));border-radius:8px;background:transparent;color:hsl(var(--muted-foreground));font-size:14px;cursor:pointer';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.style.display = 'none';
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      btn.disabled = true;
      btn.textContent = t('editor.uploading');
      try {
        const media = await uploadMedia(file);
        this.data.url = media.url;
        this.renderPlayer(wrapper);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = (e as Error).message || t('editor.uploadFailed');
      }
    });
    wrapper.append(btn, input);
  }

  save(): { url: string } {
    return { url: this.data.url || '' };
  }
}

/**
 * Marker, plus the one sanitize rule that lets a mention chip survive being saved.
 *
 * Editor.js builds each block's whitelist from the block tool *and its inline
 * tools*; nothing in a paragraph declares `<span>`, so a chip typed into one is
 * stripped back to plain text on the next save — the `@Dana Park` stays, the
 * mention doesn't. A table cell doesn't hit this because the table tool declares
 * its own whitelist (`ResizableTableTool.sanitize`); paragraphs and list items
 * have no such hook, so the rule rides in on an inline tool, which every block
 * with an inline toolbar inherits.
 *
 * The attributes match the table's rule exactly — the same chips, written in a
 * different kind of block.
 */
class MarkerWithChips extends Marker {
  static get sanitize() {
    return {
      ...(Marker as unknown as { sanitize: Record<string, unknown> }).sanitize,
      span: { class: true, 'data-user-id': true, 'data-date': true },
    };
  }
}

function withFallbackBlocks(blocks: EditorBlockSeed[]): EditorBlockSeed[] {
  return blocks.length > 0 ? blocks : [{ type: 'paragraph', data: { text: '' } }];
}

/**
 * Block-style rich text editor (Editor.js). Reads/writes plain HTML via the
 * `lib/editorjs` converters, so it's a drop-in for a `<Textarea>` whose value is
 * a string — existing plain-text values round-trip as a single paragraph. Tools:
 * header / list / marker / inline-code / underline / code / table, plus an
 * optional compressing image tool (`images` prop).
 *
 * Links inside the text are clickable while writing, on the same terms as the
 * read view (`useExternalLink`): new tab, and an off-domain address has to be
 * confirmed first. **Alt-click puts the caret in the link instead** — that's how
 * you edit the words of a link you can otherwise only follow.
 */
export function RichTextEditor({
  value,
  onChange,
  initialBlocks,
  placeholder,
  minHeight,
  images = false,
  diagrams = false,
  minimal = false,
  mentions = false,
  people,
  autoFocus = false,
  onComment,
  commentLabel,
  onReady,
  className,
}: RichTextEditorProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorJS | null>(null);
  const initialValueRef = useRef(value);
  const initialBlocksRef = useRef(initialBlocks);
  const lastEmittedRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const placeholderRef = useRef(placeholder);
  const minHeightRef = useRef(minHeight);
  const imagesRef = useRef(images);
  const diagramsRef = useRef(diagrams);
  const minimalRef = useRef(minimal);
  const mentionsRef = useRef(mentions);
  const autoFocusRef = useRef(autoFocus);
  // The editor is built once on mount, but the handler it calls is re-created on
  // every render of the page around it — so the tool reads it through a ref.
  const onCommentRef = useRef(onComment);
  onCommentRef.current = onComment;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const commentOnRef = useRef(!!onComment);
  const commentLabelRef = useRef(commentLabel);
  const links = useExternalLink();
  // Hover an image while writing → a magnifier over its corner opens the same
  // lightbox the read view does. A click can't be used here: in a contenteditable
  // it belongs to the caret.
  const imageZoom = useImageZoom(holderRef);
  // People the `@` and cell `/` menus can mention. Read through a ref because
  // the editor is built once on mount, well before this query resolves; the
  // query key is shared with every other member list, so it costs one request.
  const { data: usersData } = useUsers({ limit: 100 });
  const peopleRef = useRef<SlashPerson[]>([]);
  peopleRef.current =
    people ?? usersData?.items.map((u) => ({ id: u.id, name: u.name, email: u.email })) ?? [];

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /**
   * Follow a link that was clicked in the text. Editor.js content is a
   * contenteditable, where a plain click only moves the caret — so the click has
   * to be taken here, but only when it's unambiguously a click and not the start
   * of an edit:
   *  · a modifier is held (Alt to edit the link's words, ⌘/Ctrl for the browser's
   *    own new-tab), so the caret lands and nothing opens;
   *  · text got selected by the drag, i.e. the user is selecting, not clicking;
   *  · the anchor belongs to the editor's own chrome rather than to a block.
   *
   * Nothing is written to the DOM here on purpose: an attribute added to an
   * anchor would be saved back into the block's HTML and dirty the document.
   */
  const onLinkClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const anchor = (e.target as HTMLElement).closest?.('a[href]');
      if (!anchor || !holderRef.current?.contains(anchor) || !anchor.closest('.ce-block')) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      if (links.open(anchor.getAttribute('href') || '')) e.preventDefault();
    },
    [links],
  );

  // Init once — the editor owns its state after mount; `onChange` emits HTML up.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    let editor: EditorJS | null = null;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let mentionMenu: MentionMenu | null = null;
    let slashMenu: SlashMenu | null = null;
    let unbindShortcuts: (() => void) | null = null;
    let unbindRules: (() => void) | null = null;
    let unbindInsertLine: (() => void) | null = null;
    let rafId = 0;

    const initTimer = window.setTimeout(() => {
      if (cancelled || !holderRef.current) return;
      while (holder.firstChild) holder.removeChild(holder.firstChild);

      const initialBlocks = withFallbackBlocks(
        initialBlocksRef.current ?? htmlToBlocks(initialValueRef.current),
      );
      const instance = new EditorJS({
        holder,
        placeholder: placeholderRef.current,
        minHeight: minHeightRef.current ?? 40,
        data: { blocks: initialBlocks },
        // Key order here *is* the order of the block menu, so it reads the way a
        // page gets built — headings, lists, the furniture between them — rather
        // than the order the tools happened to be imported in. Structure is for
        // documents; a comment box (`minimal`) gets formatting only, which is
        // why the same condition appears more than once instead of once at the
        // end.
        tools: {
          ...(minimalRef.current
            ? {}
            : {
                header: {
                  class: Header,
                  inlineToolbar: true,
                  // Four levels, not six. Past H4 the sizes stop being tellable
                  // apart on a page, and a picker of six is a picker nobody
                  // reads to the end of.
                  config: { levels: [1, 2, 3, 4], defaultLevel: 2 },
                  // One toolbox entry per level, so `/h2` lands on a heading of
                  // that size directly — rather than a generic "Heading" you
                  // then have to re-open the block menu to resize.
                  toolbox: HEADINGS.map(({ level, title }) => ({
                    title: title(),
                    icon: headingIcon(level),
                    data: { level },
                  })),
                },
              }),
          list: { class: List, inlineToolbar: true },
          ...(minimalRef.current
            ? {}
            : {
                quote: { class: QuoteTool, inlineToolbar: true },
                // Fold a passage away behind a headline. Stores as `<details>`,
                // so every read view opens it without a line of script.
                toggle: { class: ToggleTool, inlineToolbar: true },
                divider: DividerTool,
              }),
          code: {
            class: CodeTool,
            shortcut: 'CMD+SHIFT+C',
            config: { placeholder: t('editor.enterCode') },
          },
          marker: MarkerWithChips,
          inlineCode: InlineCode,
          underline: Underline,
          strikethrough: StrikeTool,
          ...(minimalRef.current
            ? {}
            : {
                // The stock table plus drag-to-resize columns and rows, and a `/`
                // menu inside a cell (list, checklist, link, code, image, mention,
                // date).
                table: {
                  class: ResizableTableTool,
                  inlineToolbar: true,
                  config: {
                    rows: 2,
                    cols: 3,
                    withHeadings: true,
                    images: imagesRef.current,
                    people: () => peopleRef.current,
                  },
                },
              }),
          // Drag-to-resize image tool (upload to storage, base64 fallback,
          // paste/drop, caption) + a minimal video block.
          ...(imagesRef.current ? { image: ResizableImageTool, video: VideoTool } : {}),
          // Mermaid diagrams, stored as source and drawn on render.
          ...(diagramsRef.current ? { mermaid: MermaidTool } : {}),
          // "Comment on this passage". An inline tool rather than a floating
          // button so it sits where the other selection actions already are —
          // and it writes nothing into the block (see CommentTool).
          ...(commentOnRef.current
            ? {
                comment: {
                  class: CommentTool,
                  config: {
                    title: commentLabelRef.current,
                    onComment: (range: Range) => onCommentRef.current?.(range),
                  },
                },
              }
            : {}),
        },
        onChange: () => {
          void emitHtml();
        },
      });
      editor = instance;
      editorRef.current = instance;

      // Save the editor's blocks back out as HTML and emit upward, skipping
      // no-op round trips.
      async function emitHtml() {
        try {
          const saved = await instance.save();
          const nextHtml = blocksToHtml((saved.blocks as unknown as HtmlEditorBlock[]) ?? []);
          if (nextHtml !== lastEmittedRef.current) {
            lastEmittedRef.current = nextHtml;
            onChangeRef.current(nextHtml);
          }
        } catch {
          /* ignore save races during teardown */
        }
      }

      // Add a copy button to code blocks once rendered, and whenever blocks change.
      instance.isReady
        .then(() => {
          if (cancelled) return;
          enhanceCodeBlocks(holder);
          // Ctrl+B / Ctrl+I / Ctrl+U, which on a Mac reached nothing.
          unbindShortcuts = bindInlineShortcuts(holder, () => void emitHtml());
          // `/` anywhere in a line — blocks *and* the inline chips a paragraph
          // can hold. The flags mirror the tools above, so the menu offers
          // exactly what this surface can actually insert.
          slashMenu = new SlashMenu({
            host: 'block',
            editor: instance,
            minimal: minimalRef.current,
            images: imagesRef.current,
            diagrams: diagramsRef.current,
            people: mentionsRef.current ? () => peopleRef.current : undefined,
            onChange: () => void emitHtml(),
          });
          slashMenu.bind(holder);
          // `@` mentions across the editor's blocks (the table cell's `/` menu
          // covers cells, which this one stays out of).
          if (mentionsRef.current) {
            mentionMenu = new MentionMenu({
              people: () => peopleRef.current,
              onChange: () => void emitHtml(),
            });
            mentionMenu.bind(holder);
          }
          // Bound after the menus, so an open menu still owns Enter and Tab:
          // capture listeners on the same node run in the order they were added.
          //  · `*`/`1.`/`[]` + space → a list, and Backspace out of a nested item;
          unbindRules = bindBlockInputRules(holder, {
            editor: instance,
            onChange: () => void emitHtml(),
          });
          //  · a `+` on the seam above an image, which has no line to type on.
          unbindInsertLine = bindInsertLine(holder, {
            editor: instance,
            onChange: () => void emitHtml(),
          });
          if (autoFocusRef.current) {
            try {
              instance.focus(true);
            } catch {
              /* ignore: focus is a nicety */
            }
          }
          // Undo/redo history (Ctrl/Cmd+Z undo, Ctrl/Cmd+Y redo). Seed the
          // baseline with the initial blocks — without initialize() the first
          // undo empties the editor. Progressive enhancement: never let a
          // failure here take the editor down with it.
          try {
            new Undo({ editor: instance }).initialize({ blocks: initialBlocks });
          } catch {
            /* ignore: undo is optional */
          }
          // Last, so anyone driving the editor from outside gets it fully
          // wired: menus bound, shortcuts live, history seeded.
          onReadyRef.current?.(instance);
        })
        .catch(() => {
          /* ignore init races */
        });
      observer = new MutationObserver(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => enhanceCodeBlocks(holder));
      });
      observer.observe(holder, { childList: true, subtree: true });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      unbindShortcuts?.();
      unbindRules?.();
      unbindInsertLine?.();
      slashMenu?.destroy();
      mentionMenu?.destroy();
      const e = editor;
      editor = null;
      if (editorRef.current === e) editorRef.current = null;
      if (!e) return;
      // Tell the outside the instance is gone *before* it is destroyed, so a
      // binding can unsubscribe rather than write into a torn-down editor.
      onReadyRef.current?.(null);
      e.isReady
        .then(() => {
          try {
            e.destroy?.();
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          /* ignore */
        });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={holderRef}
        onClick={onLinkClick}
        className={`rich-text-editor${className ? ` ${className}` : ''}`}
      />
      {imageZoom.node}
      {links.node}
    </>
  );
}

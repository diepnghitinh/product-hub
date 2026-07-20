import { useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Marker from '@editorjs/marker';
import InlineCode from '@editorjs/inline-code';
import Underline from '@editorjs/underline';
import CodeTool from '@editorjs/code';
import Table from '@editorjs/table';
import { blocksToHtml, htmlToBlocks, type HtmlEditorBlock } from '@/lib/editorjs';
import { enhanceCodeBlocks } from '@/lib/enhanceCodeBlocks';
import { ResizableImageTool } from '@/lib/editor/ResizableImageTool';
import { uploadMedia } from '@/features/uploads/api';
import '@/styles/rich-text-editor.css';

export interface RichTextEditorProps {
  /** Stored value as HTML (converted to/from Editor.js blocks internally). */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /**
   * Enable image + short-video blocks. Media uploads to the workspace's
   * configured storage (Settings → Storage); with none set up, images fall back
   * to an inline base64 data URL. Off by default to keep plain descriptions light.
   */
  images?: boolean;
  className?: string;
}

/**
 * A minimal Editor.js block for short videos: pick a file → upload to storage →
 * <video>. Self-contained (calls the upload endpoint directly) and inline-styled
 * so it needs no extra CSS. Only offered when the editor's `images` prop is on.
 */
class VideoTool {
  static get toolbox() {
    return {
      title: 'Video',
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
    btn.textContent = 'Select a video';
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
      btn.textContent = 'Uploading…';
      try {
        const media = await uploadMedia(file);
        this.data.url = media.url;
        this.renderPlayer(wrapper);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = (e as Error).message || 'Upload failed — click to retry';
      }
    });
    wrapper.append(btn, input);
  }

  save(): { url: string } {
    return { url: this.data.url || '' };
  }
}

function withFallbackBlocks(blocks: HtmlEditorBlock[]): HtmlEditorBlock[] {
  return blocks.length > 0 ? blocks : [{ type: 'paragraph', data: { text: '' } }];
}

/**
 * Block-style rich text editor (Editor.js). Reads/writes plain HTML via the
 * `lib/editorjs` converters, so it's a drop-in for a `<Textarea>` whose value is
 * a string — existing plain-text values round-trip as a single paragraph. Tools:
 * header / list / marker / inline-code / underline / code / table, plus an
 * optional compressing image tool (`images` prop).
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight,
  images = false,
  className,
}: RichTextEditorProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorJS | null>(null);
  const initialValueRef = useRef(value);
  const lastEmittedRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const placeholderRef = useRef(placeholder);
  const minHeightRef = useRef(minHeight);
  const imagesRef = useRef(images);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Init once — the editor owns its state after mount; `onChange` emits HTML up.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    let editor: EditorJS | null = null;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let rafId = 0;

    const initTimer = window.setTimeout(() => {
      if (cancelled || !holderRef.current) return;
      while (holder.firstChild) holder.removeChild(holder.firstChild);

      const instance = new EditorJS({
        holder,
        placeholder: placeholderRef.current,
        minHeight: minHeightRef.current ?? 40,
        data: { blocks: withFallbackBlocks(htmlToBlocks(initialValueRef.current)) },
        tools: {
          header: { class: Header, inlineToolbar: true },
          list: { class: List, inlineToolbar: true },
          marker: Marker,
          inlineCode: InlineCode,
          underline: Underline,
          code: {
            class: CodeTool,
            shortcut: 'CMD+SHIFT+C',
            config: { placeholder: 'Enter code' },
          },
          table: {
            class: Table,
            inlineToolbar: true,
            config: { rows: 2, cols: 3, withHeadings: true },
          },
          // Drag-to-resize image tool (upload to storage, base64 fallback,
          // paste/drop, caption) + a minimal video block.
          ...(imagesRef.current ? { image: ResizableImageTool, video: VideoTool } : {}),
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
          if (!cancelled) enhanceCodeBlocks(holder);
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
      const e = editor;
      editor = null;
      if (editorRef.current === e) editorRef.current = null;
      if (!e) return;
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
    <div ref={holderRef} className={`rich-text-editor${className ? ` ${className}` : ''}`} />
  );
}

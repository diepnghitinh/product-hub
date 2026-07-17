import { useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Marker from '@editorjs/marker';
import InlineCode from '@editorjs/inline-code';
import Underline from '@editorjs/underline';
import CodeTool from '@editorjs/code';
import Table from '@editorjs/table';
import ImageTool from '@editorjs/image';
import { blocksToHtml, htmlToBlocks, type HtmlEditorBlock } from '@/lib/editorjs';
import { enhanceCodeBlocks } from '@/lib/enhanceCodeBlocks';
import { compressImageFile } from '@/lib/compressImage';
import '@/styles/rich-text-editor.css';

export interface RichTextEditorProps {
  /** Stored value as HTML (converted to/from Editor.js blocks internally). */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /**
   * Enable pasting/selecting images. Each image is compressed in the browser
   * and stored inline as a base64 data URL (no upload endpoint) — see
   * `compressImageFile`. Off by default to keep plain descriptions light.
   */
  images?: boolean;
  className?: string;
}

/** Image tool wired to compress client-side, then inline as a data URL — so a
 * pasted screenshot round-trips through the HTML `description` field. */
const compressingImageTool = {
  class: ImageTool,
  config: {
    uploader: {
      uploadByFile: async (file: File) => ({
        success: 1,
        file: { url: await compressImageFile(file) },
      }),
      // A pasted image URL is kept as-is (nothing local to compress).
      uploadByUrl: async (url: string) => ({ success: 1, file: { url } }),
    },
  },
};

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
          // Compresses on paste/drop/select; the tool auto-registers image-file
          // paste handling when present.
          ...(imagesRef.current ? { image: compressingImageTool } : {}),
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

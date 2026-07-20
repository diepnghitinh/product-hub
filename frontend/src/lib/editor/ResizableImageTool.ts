// A drop-in Editor.js image block that you can **resize by dragging** — the piece
// the stock `@editorjs/image` tool never offered. It stays wire-compatible with
// the existing HTML round-trip (`lib/editorjs.ts`): the width is stored as a
// responsive `%` on `data.file.width`, which `blocksToHtml` writes to the
// `<img>`'s inline style and `htmlToBlocks` reads back — so resized images
// persist and render everywhere the description HTML is shown.
//
// Kept from the stock tool: upload to the workspace's storage (with a base64
// data-URL fallback when none is configured), image paste / file-drop, and an
// optional caption. Added: the resize handle and an "Add border" tune.
import type { API, BlockAPI } from '@editorjs/editorjs';
import { uploadMedia } from '@/features/uploads/api';
import { compressImageFile } from '@/lib/compressImage';

/** Block data — the shape `lib/editorjs.ts` already reads and writes. */
export interface ResizableImageData {
  file: { url: string; width?: string };
  caption?: string;
  withBorder?: boolean;
}

const MIN_PCT = 10;
const MAX_PCT = 100;
const KEY_STEP = 5;

const TOOLBOX_ICON =
  '<svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>';
const BORDER_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';

/** Plain text of a (possibly marked-up) caption, for the `alt`. */
const stripTags = (v: string) => v.replace(/<[^>]*>/g, '');

const clampPct = (pct: number) => Math.max(MIN_PCT, Math.min(MAX_PCT, Math.round(pct)));

/**
 * Upload to the configured storage; fall back to an inline compressed data URL
 * when none is set up (or the upload fails) — mirrors the old uploader so images
 * keep working with zero storage config.
 */
async function toUrl(file: File): Promise<string> {
  try {
    return (await uploadMedia(file)).url;
  } catch {
    return compressImageFile(file);
  }
}

interface PasteEventLike {
  type: 'tag' | 'file' | 'pattern';
  detail: { data?: HTMLElement; file?: File };
}

export class ResizableImageTool {
  static get toolbox() {
    return { title: 'Image', icon: TOOLBOX_ICON };
  }
  static get isReadOnlySupported() {
    return true;
  }
  /** Let a pasted `<img>` or a dropped/pasted image file land in this block. */
  static get pasteConfig() {
    return { tags: ['img'], files: { mimeTypes: ['image/*'] } };
  }

  private data: ResizableImageData;
  private readonly api: API;
  private readonly block?: BlockAPI;
  private readonly readOnly: boolean;
  private readonly wrapper: HTMLElement;
  private frame: HTMLElement | null = null;
  private sizeLabel: HTMLElement | null = null;

  constructor(opts: {
    data?: Partial<ResizableImageData>;
    api: API;
    block?: BlockAPI;
    readOnly?: boolean;
  }) {
    const { data, api, block, readOnly } = opts;
    this.data = {
      file: {
        url: data?.file?.url ?? '',
        ...(data?.file?.width ? { width: data.file.width } : {}),
      },
      caption: data?.caption ?? '',
      withBorder: !!data?.withBorder,
    };
    this.api = api;
    this.block = block;
    this.readOnly = !!readOnly;
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'rte-image';
  }

  render(): HTMLElement {
    if (this.data.file.url) this.renderImage();
    else if (!this.readOnly) this.renderPicker();
    return this.wrapper;
  }

  // ── Empty state: pick a file ───────────────────────────────────────────────
  private renderPicker() {
    this.wrapper.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rte-image__picker';
    btn.textContent = 'Select an image';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      btn.disabled = true;
      btn.textContent = 'Uploading…';
      try {
        await this.setUrl(await toUrl(file));
      } catch (e) {
        btn.disabled = false;
        btn.textContent = (e as Error)?.message || 'Upload failed — click to retry';
      }
    });
    this.wrapper.append(btn, input);
  }

  private async setUrl(url: string) {
    this.data.file = { url };
    this.renderImage();
    this.block?.dispatchChange?.();
  }

  // ── Filled state: image + resize handle + caption ──────────────────────────
  private renderImage() {
    this.wrapper.innerHTML = '';

    const frame = document.createElement('div');
    frame.className = 'rte-image__frame';
    frame.classList.toggle('img-bordered', !!this.data.withBorder);
    if (this.data.file.width) frame.style.width = this.data.file.width;
    this.frame = frame;

    const img = document.createElement('img');
    img.className = 'rte-image__img';
    img.src = this.data.file.url;
    img.alt = stripTags(this.data.caption ?? '');
    img.draggable = false;
    frame.append(img);

    if (!this.readOnly) {
      const handle = document.createElement('span');
      handle.className = 'rte-image__handle';
      handle.setAttribute('role', 'slider');
      handle.tabIndex = 0;
      handle.setAttribute('aria-label', 'Resize image');
      handle.title = 'Drag to resize';
      this.attachResize(handle);

      const label = document.createElement('span');
      label.className = 'rte-image__size';
      this.sizeLabel = label;

      frame.append(handle, label);
    }

    const caption = document.createElement('div');
    caption.className = 'rte-image__caption';
    caption.dataset.placeholder = 'Caption (optional)';
    caption.contentEditable = String(!this.readOnly);
    caption.innerHTML = this.data.caption ?? '';

    this.wrapper.append(frame, caption);
  }

  /** Live width as a % of the block's content column. */
  private currentPct(): number {
    const frameW = this.frame?.getBoundingClientRect().width ?? 0;
    const contentW = this.wrapper.getBoundingClientRect().width || frameW || 1;
    return clampPct((frameW / contentW) * 100);
  }

  private setPct(pct: number) {
    const p = clampPct(pct);
    if (this.frame) this.frame.style.width = `${p}%`;
    this.data.file.width = `${p}%`;
    if (this.sizeLabel) this.sizeLabel.textContent = `${p}%`;
  }

  private attachResize(handle: HTMLElement) {
    let startX = 0;
    let startW = 0;
    let contentW = 1;

    const onMove = (e: PointerEvent) => {
      this.setPct(((startW + (e.clientX - startX)) / contentW) * 100);
    };
    const onUp = (e: PointerEvent) => {
      handle.releasePointerCapture?.(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.frame?.classList.remove('is-resizing');
      this.block?.dispatchChange?.();
    };

    handle.addEventListener('pointerdown', (e) => {
      // Claim the gesture before Editor.js reads it as a block drag.
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startW = this.frame?.getBoundingClientRect().width ?? 0;
      contentW = this.wrapper.getBoundingClientRect().width || startW || 1;
      this.frame?.classList.add('is-resizing');
      if (this.sizeLabel) this.sizeLabel.textContent = `${this.currentPct()}%`;
      handle.setPointerCapture?.(e.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    // Keyboard: ←/→ nudge by 5% for accessibility.
    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      this.setPct(this.currentPct() + (e.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP));
      this.block?.dispatchChange?.();
    });
  }

  // ── Paste an <img> / drop an image file ────────────────────────────────────
  onPaste(event: PasteEventLike) {
    if (event.type === 'tag') {
      const src = (event.detail.data as HTMLImageElement | undefined)?.src;
      if (src) void this.setUrl(src);
      return;
    }
    if (event.type === 'file' && event.detail.file) {
      const file = event.detail.file;
      void toUrl(file).then((url) => this.setUrl(url)).catch(() => {});
    }
  }

  // ── Block settings (tunes): border toggle ──────────────────────────────────
  renderSettings() {
    return [
      {
        icon: BORDER_ICON,
        label: this.data.withBorder ? 'Remove border' : 'Add border',
        closeOnActivate: true,
        isActive: !!this.data.withBorder,
        onActivate: () => {
          this.data.withBorder = !this.data.withBorder;
          this.frame?.classList.toggle('img-bordered', this.data.withBorder);
          this.block?.dispatchChange?.();
        },
      },
    ];
  }

  save(): ResizableImageData {
    const caption =
      (this.wrapper.querySelector('.rte-image__caption') as HTMLElement | null)?.innerHTML.trim() ??
      '';
    const width = this.data.file.width;
    return {
      file: { url: this.data.file.url, ...(width ? { width } : {}) },
      caption,
      ...(this.data.withBorder ? { withBorder: true } : {}),
    };
  }

  validate(data: ResizableImageData): boolean {
    return !!data.file?.url;
  }
}

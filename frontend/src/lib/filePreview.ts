import { toast } from 'sonner';
import { downloadUpload } from '@/features/uploads/api';
import type { AttachedFile } from '@/types/dto';

/**
 * How a file is rendered in {@link FilePreviewDialog}. `none` means there's no
 * in-app view for it and the dialog offers a download instead — that's the honest
 * answer for the legacy binary Office formats (`.doc`, `.ppt`) and for slide
 * decks, which no browser-side renderer handles well enough to be worth shipping.
 */
export type PreviewKind = 'image' | 'pdf' | 'sheet' | 'word' | 'text' | 'none';

/** Lowercased extension of a filename, without the dot ('' when it has none). */
export function fileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * What the file picker offers wherever files can be attached. Mirrors the API's
 * `DOCUMENT_TYPE_BY_EXT` plus images, which uploads already accept — someone
 * attaching a screenshot beside the spec shouldn't be told to put it in the body.
 */
export const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.rtf,image/*';

/**
 * How many files one record holds. Mirrors `MAX_ATTACHMENTS` in the API's
 * `sanitizeStoredFiles` — the server is what enforces it; saying so up front
 * beats uploading twelve files and watching the list silently keep ten.
 */
export const MAX_ATTACHMENTS = 25;

/**
 * How to render this file, decided from the type the *upload* settled on with
 * the extension as a fallback.
 *
 * Content type first because it's the trustworthy field — the API derives it
 * from the extension at upload time and stores that (see `classifyUpload`), so
 * it can't be spoofed by a renamed file. The extension is still consulted
 * because pre-existing rows and CSVs uploaded as `text/plain` exist.
 *
 * SVG is deliberately not an `image` here: it can carry script, so it's treated
 * as an ordinary download rather than something rendered in the page.
 */
export function previewKindOf(file: Pick<AttachedFile, 'contentType' | 'name'>): PreviewKind {
  const type = (file.contentType || '').toLowerCase();
  const ext = fileExt(file.name);

  if (type === 'image/svg+xml' || ext === 'svg') return 'none';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(ext))
    return 'image';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    type.includes('spreadsheetml') ||
    type === 'application/vnd.ms-excel' ||
    type === 'text/csv' ||
    ['xlsx', 'xls', 'csv'].includes(ext)
  )
    return 'sheet';
  if (type.includes('wordprocessingml') || ext === 'docx') return 'word';
  if (type === 'text/plain' || type === 'text/markdown' || ['txt', 'md'].includes(ext))
    return 'text';
  return 'none';
}

/** Whether clicking this file's name should open the viewer rather than download it. */
export const canPreview = (file: Pick<AttachedFile, 'contentType' | 'name'>): boolean =>
  previewKindOf(file) !== 'none';

/**
 * Save a file, reporting a failure rather than doing nothing visible. Shared so
 * the chip row and the viewer's own Download button behave identically — and so
 * neither has to import the other.
 */
export function downloadFile(file: AttachedFile): void {
  void downloadUpload(file).catch((e) => toast.error((e as Error).message));
}

/**
 * A URL safe to put in an `href`.
 *
 * Attachments are stored as free-form strings on the record they hang off, and a
 * roadmap item's are only sanitized on write — rows saved before that, or by any
 * other writer, still have to be safe to render. Anything that isn't plain
 * http(s) becomes an inert `#`.
 */
export function safeFileUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : '#';
  } catch {
    return '#';
  }
}

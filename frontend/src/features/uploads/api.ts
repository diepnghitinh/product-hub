import { useMutation } from '@tanstack/react-query';
import { api, apiDownload } from '@/lib/api';

/** Result of a successful upload — the stored file's public URL + metadata. */
export interface UploadedMedia {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

export interface UploadOptions {
  /**
   * Called with 0–100 as the file goes up. This is the *browser → API* leg
   * only, which is the slow one on any normal connection; the API then pushes
   * the bytes to cloud storage, which the browser can't see. So 100% means
   * "sent", not "stored" — callers show a finishing state until the promise
   * settles rather than pretending the bar is the whole job.
   */
  onProgress?: (percent: number) => void;
  /** Abort the upload — what a cancel button on an in-flight file uses. */
  signal?: AbortSignal;
}

/**
 * Upload one image, video or document to the workspace's configured storage and
 * get back its public URL. Plain async (not a hook) so it works anywhere —
 * including the rich-text editor's image tool. Multipart; axios sets the
 * boundary. Errors surface the API message (e.g. "Video is too large — the
 * limit is 30MB.").
 */
export async function uploadMedia(file: File, options: UploadOptions = {}): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);
  const res = await api.post('/uploads', body, {
    signal: options.signal,
    onUploadProgress: options.onProgress
      ? (e) => {
          // `total` is absent when the body length isn't known up front; a
          // FormData holding one File always has it, but never divide by
          // undefined — fall back to the size the file itself reports.
          const total = e.total || file.size;
          if (total > 0) {
            options.onProgress?.(Math.min(100, Math.round((e.loaded / total) * 100)));
          }
        }
      : undefined,
  });
  return res.data.data as UploadedMedia;
}

/** Mutation wrapper for components that want pending/error state. */
export function useUploadMedia() {
  // Wrapped, not passed by reference: react-query hands the mutation fn its own
  // context as a second argument, which isn't `UploadOptions`.
  return useMutation({ mutationFn: (file: File) => uploadMedia(file) });
}

/**
 * Read a stored file's bytes back, through the API rather than from the storage
 * URL directly.
 *
 * The viewer has to *parse* a spreadsheet or a Word file to render it, and the
 * bucket is a different origin — so a direct `fetch` needs CORS headers almost
 * no bucket is configured with. `/uploads/content` re-serves the same bytes from
 * the API's own origin (and only for URLs in this workspace's storage), which is
 * what makes previews work without an admin touching their bucket config.
 */
export async function fetchUploadBytes(url: string): Promise<ArrayBuffer> {
  const res = await api.get<ArrayBuffer>('/uploads/content', {
    params: { url },
    responseType: 'arraybuffer',
  });
  return res.data;
}

/**
 * Save a stored file to disk. Goes through the API so the browser's downloader
 * gets the filename we recorded — an `<a download>` pointing at the bucket is
 * cross-origin, where the attribute is ignored and a PDF opens in a tab instead.
 */
export function downloadUpload(file: { url: string; name: string }): Promise<void> {
  // `name` so it saves as `spec.docx`, not the uuid-prefixed storage key.
  return apiDownload('/uploads/content', file.name, { url: file.url, name: file.name });
}

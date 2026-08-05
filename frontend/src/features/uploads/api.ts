import { useMutation } from '@tanstack/react-query';
import { api, apiDownload } from '@/lib/api';

/** Result of a successful upload — the stored file's public URL + metadata. */
export interface UploadedMedia {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Upload one image or short video to the workspace's configured storage and get
 * back its public URL. Plain async (not a hook) so it works anywhere — including
 * the rich-text editor's image tool. Multipart; axios sets the boundary. Errors
 * surface the API message (e.g. "Video is too large — the limit is 30MB.").
 */
export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);
  const res = await api.post('/uploads', body);
  return res.data.data as UploadedMedia;
}

/** Mutation wrapper for components that want pending/error state. */
export function useUploadMedia() {
  return useMutation({ mutationFn: uploadMedia });
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

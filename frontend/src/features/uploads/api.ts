import { useMutation } from '@tanstack/react-query';
import { ApiError, api, apiDownload } from '@/lib/api';

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
 * Above this, a file goes up in chunks instead of one request — the rule being
 * "more than a single chunk's worth", matching the server's 8 MiB chunk.
 *
 * It was 16 MiB, which left the 8–16 MiB band on the single-shot path: one long
 * POST with no retry, so a dropped connection nine tenths of the way through a
 * 9 MB spreadsheet threw the whole transfer away. Two round trips are cheap next
 * to that. Below one chunk there is nothing to resume *to*, so it stays whole.
 */
const CHUNKED_THRESHOLD = 8 * 1024 * 1024;

/** How many times one chunk is re-sent before the whole upload gives up. */
const MAX_CHUNK_ATTEMPTS = 3;

/** Where the signed ticket rides between begin, part and complete. */
const TICKET_HEADER = 'x-upload-ticket';

/**
 * The chunk number, in a header rather than the URL on purpose: the browser
 * caches a CORS preflight per *URL*, so `?part=1` and `?part=2` would each cost
 * their own OPTIONS round trip. One URL for every chunk, one preflight.
 */
const PART_HEADER = 'x-upload-part';

interface UploadTicketInfo {
  ticket: string;
  chunkSize: number;
  parts: number;
}

interface UploadedPart {
  partNumber: number;
  etag: string;
}

/**
 * Upload one image, video or document to the workspace's configured storage and
 * get back its public URL. Plain async (not a hook) so it works anywhere —
 * including the rich-text editor's image tool. Errors surface the API message
 * (e.g. "Video is too large — the limit is 30MB.").
 *
 * Big files are split into chunks automatically. That's decided here, in the one
 * function everything uploads through, rather than at each call site: a caller
 * shouldn't have to know how large is large, and the result is the same shape
 * either way.
 */
export function uploadMedia(file: File, options: UploadOptions = {}): Promise<UploadedMedia> {
  return file.size > CHUNKED_THRESHOLD ? uploadChunked(file, options) : uploadWhole(file, options);
}

/** One request, one file. The path a screenshot or a small PDF takes. */
async function uploadWhole(file: File, options: UploadOptions): Promise<UploadedMedia> {
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

/**
 * Upload a large file in chunks: agree the upload, send the pieces, assemble.
 *
 * Two things this buys, both of which a 200MB single POST can't: the server
 * never holds the whole file in memory (each chunk is forwarded to cloud storage
 * as it lands), and a dropped connection costs one chunk instead of everything —
 * chunks retry individually, so a flaky café network finishes the upload rather
 * than restarting it.
 */
async function uploadChunked(file: File, options: UploadOptions): Promise<UploadedMedia> {
  // The size and type are checked here, before a byte moves — an over-cap file
  // is refused in one small request instead of after a long upload.
  const begun = await api.post(
    '/uploads/chunked/begin',
    { name: file.name, size: file.size, contentType: file.type || undefined },
    { signal: options.signal },
  );
  const { ticket, chunkSize } = begun.data.data as UploadTicketInfo;
  const headers = { [TICKET_HEADER]: ticket };

  const parts: UploadedPart[] = [];
  let sent = 0; // bytes in chunks that finished
  let shown = 0; // never let the bar go backwards when a chunk retries
  const report = (bytes: number) => {
    if (!options.onProgress || !file.size) return;
    shown = Math.max(shown, Math.min(100, Math.round((bytes / file.size) * 100)));
    options.onProgress(shown);
  };

  try {
    for (let start = 0, index = 1; start < file.size; start += chunkSize, index++) {
      const chunk = file.slice(start, Math.min(start + chunkSize, file.size));
      const base = sent;
      parts.push(
        await sendChunk(chunk, index, headers, options.signal, (loaded) => report(base + loaded)),
      );
      sent += chunk.size;
      report(sent);
    }
    const done = await api.post(
      '/uploads/chunked/complete',
      { parts },
      { headers, signal: options.signal },
    );
    return done.data.data as UploadedMedia;
  } catch (err) {
    // Whatever went wrong — a cancel, a lost network, a rejected chunk — the
    // parts already stored are now garbage the provider would keep billing for.
    // Deliberately un-awaited and un-signalled: the caller's signal is usually
    // the very thing that aborted us, and the cleanup shouldn't be cancelled too.
    void api.post('/uploads/chunked/abort', {}, { headers }).catch(() => {});
    throw err;
  }
}

/** Send one chunk, retrying it on its own rather than failing the whole file. */
async function sendChunk(
  chunk: Blob,
  partNumber: number,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
  onLoaded: (bytes: number) => void,
): Promise<UploadedPart> {
  const body = new FormData();
  body.append('file', chunk, `part-${partNumber}`);

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await api.post('/uploads/chunked/part', body, {
        headers: { ...headers, [PART_HEADER]: String(partNumber) },
        signal,
        onUploadProgress: (e) => {
          // `e.loaded` counts the multipart envelope too; scale it back onto the
          // chunk's own bytes so the total still adds up to the file's size.
          const total = e.total || chunk.size;
          if (total > 0) onLoaded(Math.min(chunk.size, (e.loaded / total) * chunk.size));
        },
      });
      return res.data.data as UploadedPart;
    } catch (err) {
      if (signal?.aborted || attempt >= MAX_CHUNK_ATTEMPTS || !isRetryable(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
}

/**
 * Worth sending again? A missing status means no response arrived — a dropped
 * connection, exactly what retrying is for. A 4xx is the server having decided,
 * and it will decide the same way next time.
 */
function isRetryable(err: unknown): boolean {
  const status = err instanceof ApiError ? err.status : undefined;
  return status === undefined || status >= 500 || status === 429;
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

import { useMutation } from '@tanstack/react-query';
import { ApiError, api, apiPost } from '@/lib/api';

/** Result of a successful upload — the stored file's public URL + metadata. */
export interface UploadedMedia {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Called as the bytes go up, with 0–100. Fires once with `0` before the first
 * byte, so a caller can show the bar immediately rather than after the first
 * chunk lands — a big video otherwise looks frozen for its first second.
 *
 * Note it measures the *upload*, not the round trip: it reaches 100 when the
 * last byte leaves the browser, while the storage provider is still committing
 * the object. So treat 100 as "sent, finishing" — the promise resolving is what
 * means done.
 */
export type UploadProgressFn = (percent: number) => void;

/**
 * The API's answer to "I'm about to upload this".
 *
 * It picks the route, not us — `uploadId` set means the file goes up in parts,
 * `uploadUrl` set means one signed PUT, and neither means this provider can't be
 * uploaded to directly, so the bytes go back through the API.
 */
interface PresignedUpload {
  uploadUrl: string;
  url: string;
  name: string;
  contentType: string;
  size: number;
  /** Must be sent verbatim: they're inside the signature. */
  headers: Record<string, string>;
  expiresInSeconds: number;
  uploadId: string;
  key: string;
  partSize: number;
  /** Index `i` is part number `i + 1`. */
  partUrls: string[];
}

/**
 * The PUT to the storage provider failed in a way that says nothing about the
 * *file* — a CORS preflight the bucket refused, a DNS miss, the connection
 * dropping halfway. Distinct from an API rejection ("Video is too large"), which
 * is a verdict and must not be retried a different way.
 */
class DirectUploadError extends Error {
  constructor(
    message: string,
    /**
     * Whether sending the same bytes again could plausibly work.
     *
     * The test is *did any byte move*: a browser reports a blocked preflight and
     * a mid-transfer disconnection identically (status 0, `error` event, no
     * detail — deliberately, so a page can't probe other origins). Upload
     * progress is the one thing that separates them. Bytes moved means the
     * preflight passed and the URL is good, so the bucket's CORS is fine and
     * this was the network; nothing moved means we never got in the door.
     */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * How many times the same signed URL is spent before giving up. Retrying it is
 * free and safe: it stays valid for an hour, and a PUT to the same key is an
 * overwrite — a half-written object from the dropped attempt is replaced, not
 * appended to.
 *
 * Three is aimed at what actually happens — a lift, a tunnel, a wifi handover —
 * not at a line that is properly down, where a fourth attempt is just a longer
 * wait before the same message.
 */
const MAX_TRANSPORT_ATTEMPTS = 3;

/**
 * Parts sent at once on the multipart route.
 *
 * Three is a compromise, not a maximum: more parts in flight fills a fast line
 * better, but each one in flight is bytes at risk when the connection drops, and
 * on a slow line they compete for the same pipe and all crawl together. Three
 * keeps a good line busy without making a bad one worse.
 */
const PART_CONCURRENCY = 3;

/**
 * Upload one image, video or document to the workspace's configured storage and
 * get back its public URL. Plain async (not a hook) so it works anywhere —
 * including the rich-text editor's image tool.
 *
 * The bytes go **straight to the bucket**. The API only signs a one-shot URL, so
 * a 200MB screen recording crosses the wire once instead of twice and never sits
 * in the API's memory — it used to be uploaded to us and then uploaded again by
 * us, with a request timeout wrapped around both halves.
 *
 * Rejections still come from the API, worded as they always were ("Video is too
 * large — the limit is 30MB.") — they're decided at signing time, before a byte
 * moves, which is the nicer half of this: an over-cap file is refused instantly
 * instead of after you've watched it upload.
 *
 * A file over ~10MB goes up **in parts**, which is what makes losing the
 * connection survivable: each part is acknowledged on its own, so a drop costs the
 * part in flight instead of everything sent so far. The API decides that, not this
 * function — it reads which route it was given.
 *
 * Pass `onProgress` to drive a progress bar, and `signal` to let it be cancelled
 * mid-flight. Without either nothing changes — every existing call site is a
 * plain `uploadMedia(file)`.
 */
export async function uploadMedia(
  file: File,
  onProgress?: UploadProgressFn,
  signal?: AbortSignal,
): Promise<UploadedMedia> {
  onProgress?.(0);
  let ticket: PresignedUpload;
  try {
    ticket = await apiPost<PresignedUpload>('/uploads/presign', {
      name: file.name,
      contentType: file.type || '',
      size: file.size,
    });
  } catch (e) {
    // A 404 means an API that predates this route; anything else is a real
    // verdict on the file (unsupported type, over the cap, storage not set up)
    // and deserves to be shown rather than worked around.
    if (!isRouteMissing(e)) throw e;
    return uploadThroughApi(file, onProgress, signal);
  }

  const stored = {
    url: ticket.url,
    name: ticket.name,
    contentType: ticket.contentType,
    size: ticket.size,
  };

  if (ticket.uploadId) {
    let etags: string[];
    try {
      etags = await uploadParts(ticket, file, onProgress, signal);
    } catch (e) {
      // Whatever went wrong, the parts already in the bucket are ours to clear up.
      void abortMultipart(ticket);
      if (!(e instanceof DirectUploadError)) throw e; // Cancelled, or a refusal.
      if (e.retryable) throw e; // The network, and every part had its three goes.
      return viaApiAfter(e, file, onProgress, signal);
    }
    // The bytes are all there but the object doesn't exist until the parts are
    // joined, so this call — not the last part — is what finishes the upload.
    const { url } = await apiPost<{ url: string }>('/uploads/multipart/complete', {
      key: ticket.key,
      uploadId: ticket.uploadId,
      etags,
    });
    onProgress?.(100);
    return { ...stored, url };
  }

  // No signature to offer at all — a provider that can't issue one (Azure).
  // Nothing is wrong; the bytes just take the old road.
  if (!ticket.uploadUrl) return uploadThroughApi(file, onProgress, signal);

  try {
    await putWithRetry(ticket, file, onProgress, signal);
  } catch (e) {
    if (!(e instanceof DirectUploadError)) throw e; // Cancelled, or a refusal.
    if (e.retryable) throw e; // The network, and we already gave it three goes.
    return viaApiAfter(e, file, onProgress, signal);
  }

  return stored;
}

/**
 * Send the file the long way after a direct upload never got off the ground.
 *
 * "Never got off the ground" is almost always the bucket's CORS rules, which the
 * API can't set on every provider. A tenant shouldn't lose uploads over it, so we
 * go round — and leave a breadcrumb for whoever reads the console, because the
 * extra hop is worth fixing rather than living with.
 */
function viaApiAfter(
  cause: DirectUploadError,
  file: File,
  onProgress?: UploadProgressFn,
  signal?: AbortSignal,
): Promise<UploadedMedia> {
  console.warn(
    `[uploads] Direct upload to storage failed (${cause.message}) — falling back to the API. ` +
      'Allow PUT from this origin in the bucket CORS rules to avoid the extra hop.',
  );
  return uploadThroughApi(file, onProgress, signal);
}

/**
 * Send the file part by part, and hand back what each part was stored as.
 *
 * This is the resumable half of the upload. A part that drops is re-sent on its
 * own — the parts already acknowledged stay acknowledged, so a connection that
 * dies at 90% costs 5MB, not 90% of the file. Nothing is written to the bucket as
 * an object until the caller joins them.
 *
 * `PART_CONCURRENCY` parts are in flight at a time. The first hard failure stops
 * the rest immediately rather than letting them all fail their way through the
 * same wall, and is the error the caller sees.
 */
async function uploadParts(
  ticket: PresignedUpload,
  file: File,
  onProgress?: UploadProgressFn,
  signal?: AbortSignal,
): Promise<string[]> {
  if (signal?.aborted) throw abortError();
  const total = ticket.partUrls.length;
  const etags = new Array<string>(total);
  const sent = new Array<number>(total).fill(0);

  // 99 rather than 100: joining the parts is a real step that can still fail, and
  // a bar that sits at 100 while it happens has already told the user it's done.
  const report = () => {
    if (!onProgress) return;
    const done = sent.reduce((a, b) => a + b, 0);
    onProgress(Math.min(99, Math.round((done / file.size) * 100)));
  };

  // Lets one part's failure cancel its siblings. Chained to the caller's signal so
  // a user cancelling still stops everything.
  const stop = new AbortController();
  const relay = () => stop.abort();
  signal?.addEventListener('abort', relay, { once: true });

  let next = 0;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (failure === undefined) {
      const index = next++;
      if (index >= total) return;
      const start = index * ticket.partSize;
      // No third argument: the slice takes an empty type, so the browser sends no
      // Content-Type of its own. The parts carry none by design — the stored type
      // was fixed by the API when it opened the upload.
      const part = file.slice(start, Math.min(start + ticket.partSize, file.size));
      try {
        etags[index] = await putPartWithRetry(
          ticket.partUrls[index],
          part,
          (loaded) => {
            sent[index] = loaded;
            report();
          },
          stop.signal,
        );
      } catch (e) {
        if (failure === undefined) {
          failure = e;
          stop.abort();
        }
        return;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, total) }, worker));
  } finally {
    signal?.removeEventListener('abort', relay);
  }

  if (failure !== undefined) throw failure;
  // The siblings of a cancelled part swallow their own abort, so ask the caller's
  // signal directly rather than trusting that one of them reported it.
  if (signal?.aborted) throw abortError();
  return etags;
}

/** Bin the parts already uploaded. Best-effort — the bucket sweeps up the rest. */
async function abortMultipart(ticket: PresignedUpload): Promise<void> {
  try {
    await apiPost('/uploads/multipart/abort', { key: ticket.key, uploadId: ticket.uploadId });
  } catch {
    /* The upload already failed; failing to tidy up is not worth a second error. */
  }
}

/** One part, re-sent on its own if the connection drops under it. */
async function putPartWithRetry(
  url: string,
  part: Blob,
  onSent: (loaded: number) => void,
  signal: AbortSignal,
): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await putPart(url, part, onSent, signal);
    } catch (e) {
      const transport = e instanceof DirectUploadError && e.retryable;
      if (!transport || attempt >= MAX_TRANSPORT_ATTEMPTS) throw e;
      await sleep(attempt * 1000, signal);
      // Only this part starts over, so only this part's contribution to the bar does.
      onSent(0);
    }
  }
}

/**
 * PUT one part and read back the ETag that identifies it.
 *
 * The ETag is the whole point of the round trip: the parts are joined by it, so a
 * part we can't read one for is a part we can't use — which is what a bucket
 * missing `ExposeHeaders: ETag` in its CORS rules looks like from here.
 */
function putPart(
  url: string,
  part: Blob,
  onSent: (loaded: number) => void,
  signal: AbortSignal,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    let sentAnyBytes = false;
    const onAbort = () => xhr.abort();
    signal.addEventListener('abort', onAbort);
    const done = () => signal.removeEventListener('abort', onAbort);

    xhr.upload.onprogress = (e) => {
      if (e.loaded > 0) sentAnyBytes = true;
      onSent(e.loaded);
    };
    xhr.onload = () => {
      done();
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new DirectUploadError(`storage responded ${xhr.status}`, false));
        return;
      }
      const etag = xhr.getResponseHeader('ETag');
      if (!etag) {
        reject(
          new DirectUploadError(
            'the bucket does not expose the ETag header to the browser (CORS ExposeHeaders)',
            false,
          ),
        );
        return;
      }
      // The bar counts what the browser reported sending; a part that finished
      // sent all of it, and rounding errors shouldn't leave the total short.
      onSent(part.size);
      resolve(etag);
    };
    xhr.onerror = () => {
      done();
      reject(
        sentAnyBytes
          ? new DirectUploadError('Connection lost while uploading — please try again.', true)
          : new DirectUploadError('network or CORS failure', false),
      );
    };
    xhr.ontimeout = () => {
      done();
      reject(new DirectUploadError('Upload timed out — please try again.', true));
    };
    xhr.onabort = () => {
      done();
      reject(abortError());
    };

    xhr.send(part);
  });
}

/**
 * Send the file, and send it again if the connection dropped on the way.
 *
 * This is the whole answer to "what happens if I lose signal mid-upload": the
 * file restarts from byte zero on the same URL. It is not resumable — a single
 * PUT has no notion of where it got to, so the 40MB that already went up are
 * spent. Resuming would mean S3 multipart: the file split into parts, each part
 * signed and acknowledged separately, so only the part in flight is lost. That
 * is a much larger change and it earns its keep at file sizes this product's
 * caps don't currently allow (30MB video, 25MB doc, 10MB image).
 *
 * A failure that never reached the bucket is not retried here — the same wall is
 * still there on attempt two. It goes back to the caller to route to the API.
 */
async function putWithRetry(
  ticket: PresignedUpload,
  file: File,
  onProgress?: UploadProgressFn,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await putToStorage(ticket, file, onProgress, signal);
      return;
    } catch (e) {
      const transport = e instanceof DirectUploadError && e.retryable;
      if (!transport || attempt >= MAX_TRANSPORT_ATTEMPTS) throw e;
      // Widening gap: a handover recovers in a second, a lift takes longer.
      await sleep(attempt * 1000, signal);
      // The bar has to fall back to zero — the next attempt really does start
      // from the first byte, and leaving it at 60% would be a lie that then
      // appears to run backwards.
      onProgress?.(0);
    }
  }
}

/** A cancellable pause. Rejects rather than resolving late if the upload is dropped. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * PUT the file at the signed URL.
 *
 * `XMLHttpRequest` rather than `fetch`, because it is the only one that reports
 * *upload* progress; and a bare request rather than the app's axios instance,
 * because that instance attaches our bearer token to everything — and an extra
 * `Authorization` header on a presigned S3 PUT is what S3 reads instead of the
 * signature, turning every upload into a 400.
 */
function putToStorage(
  ticket: PresignedUpload,
  file: File,
  onProgress?: UploadProgressFn,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl, true);
    // Content-Length is absent from this map by design — the browser sets it from
    // the body and refuses to let script touch it.
    Object.entries(ticket.headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);
    const done = () => signal?.removeEventListener('abort', onAbort);

    // The one fact that tells a dropped connection apart from a blocked CORS
    // preflight — both arrive as status 0 with an `error` event and nothing else.
    // If any byte left the machine, the preflight passed and the URL is good.
    let sentAnyBytes = false;

    xhr.upload.onprogress = (e) => {
      if (e.loaded > 0) sentAnyBytes = true;
      // `lengthComputable` is false on some proxies; without a total there's no
      // percentage to report, so leave the bar where it is rather than jumping
      // it to a number we made up.
      if (!e.lengthComputable || !onProgress) return;
      onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      // The storage read the request and said no — an expired signature, a header
      // that didn't match, a size over what was signed. Sending the identical
      // bytes again gets the identical answer, so this one goes to the API.
      else reject(new DirectUploadError(`storage responded ${xhr.status}`, false));
    };
    xhr.onerror = () => {
      done();
      reject(
        sentAnyBytes
          ? // Worded as a sentence: once the retries are spent this is what the
            // upload list shows the person waiting on it.
            new DirectUploadError('Connection lost while uploading — please try again.', true)
          : // Nothing moved: the browser never let the request out, which is what a
            // blocked CORS preflight looks like from script. Retrying the same URL
            // would fail the same way; the API route is the way through.
            new DirectUploadError('network or CORS failure', false),
      );
    };
    xhr.ontimeout = () => {
      done();
      reject(new DirectUploadError('Upload timed out — please try again.', true));
    };
    xhr.onabort = () => {
      done();
      reject(abortError());
    };

    xhr.send(file);
  });
}

/** Matches what axios throws on `signal.abort()`, which callers already test for. */
function abortError(): Error {
  const error = new Error('Upload cancelled');
  error.name = 'CanceledError';
  return error;
}

/**
 * True for "this API doesn't have /uploads/presign" — an old server behind a
 * freshly-deployed app, which is a normal few minutes of any rolling deploy. A
 * 400/413 is the opposite: the API looked at the file and said no.
 */
function isRouteMissing(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

/**
 * The original route: multipart to our own API, which stores the file itself.
 * Still here for buckets whose CORS we can't set, and for an API without the
 * presign route.
 */
async function uploadThroughApi(
  file: File,
  onProgress?: UploadProgressFn,
  signal?: AbortSignal,
): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);
  onProgress?.(0);
  const res = await api.post('/uploads', body, {
    signal,
    onUploadProgress: onProgress
      ? (e) => {
          if (!e.total) return;
          onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
        }
      : undefined,
  });
  return res.data.data as UploadedMedia;
}

/** Mutation wrapper for components that want pending/error state. */
export function useUploadMedia() {
  // Wrapped, not passed straight through: TanStack hands the mutation function a
  // context object as its second argument, which would land in `onProgress`.
  return useMutation({ mutationFn: (file: File) => uploadMedia(file) });
}

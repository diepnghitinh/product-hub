import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadMedia, type UploadedMedia } from './api';

/** A file on its way up — one row in the UI until it lands or fails. */
export interface PendingUpload {
  /** Stable per queued file; `url` isn't known yet, and names repeat. */
  id: string;
  name: string;
  size: number;
  /** 0–100 of the browser → API leg. */
  percent: number;
  status: 'queued' | 'uploading' | 'finishing';
}

/**
 * A queue of files being uploaded, with a live percentage for each.
 *
 * The percentage comes from the browser (`XMLHttpRequest.upload.onprogress`,
 * which axios exposes as `onUploadProgress`) — the sender is the only party that
 * knows how many bytes have actually left, so this needs nothing from the server
 * and is exact. Once a file's bytes are all sent it goes to `finishing`, because
 * the API still has to push them to cloud storage: showing a bar for a leg the
 * browser can't observe would be inventing a number.
 *
 * Files upload **one at a time**. Uploads share one upstream pipe, so running
 * four at once doesn't finish sooner — it just makes four bars crawl together
 * and hides which file is actually moving.
 *
 * `onDone` fires once per drained batch with everything that succeeded, and is
 * always read from the latest render — a list that changed while the upload was
 * in flight (a save landing, a chip removed) is the one it appends to.
 */
export function useUploadQueue(onDone: (files: UploadedMedia[]) => void) {
  const [pending, setPending] = useState<PendingUpload[]>([]);

  const queue = useRef<Array<{ id: string; file: File }>>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  const results = useRef<UploadedMedia[]>([]);
  const running = useRef(false);
  const seq = useRef(0);

  // The callback closes over the caller's current list; keep the newest.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const patch = useCallback((id: string, next: Partial<PendingUpload>) => {
    setPending((list) => list.map((p) => (p.id === id ? { ...p, ...next } : p)));
  }, []);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      // Re-read the queue each pass: files dropped *during* an upload join this
      // same batch rather than starting a second one.
      while (queue.current.length) {
        const job = queue.current.shift();
        if (!job) break;
        const controller = new AbortController();
        controllers.current.set(job.id, controller);
        patch(job.id, { status: 'uploading' });
        try {
          results.current.push(
            await uploadMedia(job.file, {
              signal: controller.signal,
              onProgress: (percent) =>
                patch(job.id, { percent, status: percent >= 100 ? 'finishing' : 'uploading' }),
            }),
          );
        } catch (e) {
          // An abort rejects too — the user already knows they cancelled it.
          if (!cancelled.current.has(job.id)) toast.error((e as Error).message);
        } finally {
          cancelled.current.delete(job.id);
          controllers.current.delete(job.id);
          setPending((list) => list.filter((p) => p.id !== job.id));
        }
      }
    } finally {
      running.current = false;
      const landed = results.current;
      results.current = [];
      if (landed.length) doneRef.current(landed);
    }
  }, [patch]);

  /** Queue files and start uploading. Safe to call while a batch is running. */
  const add = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      const jobs = list.map((file) => ({ id: `u${++seq.current}`, file }));
      queue.current.push(...jobs);
      setPending((current) => [
        ...current,
        ...jobs.map(({ id, file }) => ({
          id,
          name: file.name,
          size: file.size,
          percent: 0,
          status: 'queued' as const,
        })),
      ]);
      void drain();
    },
    [drain],
  );

  /** Drop one file — abort it if it's in flight, un-queue it if it isn't. */
  const cancel = useCallback((id: string) => {
    const inFlight = controllers.current.get(id);
    if (inFlight) {
      cancelled.current.add(id);
      inFlight.abort();
    } else {
      queue.current = queue.current.filter((job) => job.id !== id);
    }
    setPending((list) => list.filter((p) => p.id !== id));
  }, []);

  // Leaving the page mid-upload abandons the batch: finishing it would call an
  // `onChange` belonging to a record that's no longer on screen.
  useEffect(
    () => () => {
      queue.current = [];
      controllers.current.forEach((c) => c.abort());
    },
    [],
  );

  return { pending, busy: pending.length > 0, add, cancel };
}

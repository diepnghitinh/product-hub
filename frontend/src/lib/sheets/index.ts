import { readWorkbookRows, type ReadWorkbookOptions, type SheetRows } from './reader';
import type { ReadRequest, ReadResponse } from './sheets.worker';

export type { ReadWorkbookOptions, SheetRows };

/**
 * Read a spreadsheet **off the main thread**.
 *
 * SheetJS parses synchronously, and on a real workbook that is not a rounding
 * error: a 9 MB file with 18 sheets of ~480 columns takes ~2.5s on an M-series
 * Mac and several times that on an ordinary laptop. Run inline, that is a frozen,
 * unclickable tab — the spinner beside it doesn't even animate, so the app reads
 * as hung rather than busy. In a worker the page stays live and the wait is
 * honest. Every `.xlsx`/`.xls`/`.csv` in the app comes through here: the file
 * preview and both importers.
 *
 * The source is never detached — the bytes are copied to the worker, not
 * transferred — so the caller's buffer stays usable and, more importantly, the
 * inline fallback below still has something to read.
 *
 * @param signal aborts the read *and terminates the worker*, so paging past a
 *   heavy sheet actually stops the parse instead of leaving it to finish unseen.
 */
export async function readWorkbook(
  source: File | Blob | ArrayBuffer,
  options: ReadWorkbookOptions = {},
  signal?: AbortSignal,
): Promise<SheetRows[]> {
  // Reading the blob is I/O, not compute — it doesn't block, so it stays here
  // and the worker's input is always a plain buffer.
  const bytes = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  signal?.throwIfAborted();

  const worker = spawn();
  if (!worker) return readWorkbookRows(bytes, options);

  try {
    return await inWorker(worker, bytes, options, signal);
  } catch (err) {
    // The worker script itself failed to load or start — an old browser without
    // module workers, a blocked blob: URL, a CSP. Parse inline instead: slow
    // enough to notice, but a preview that blocks beats one that fails. A parse
    // error or an abort is a real answer and rethrows.
    if (err instanceof WorkerUnavailable) return readWorkbookRows(bytes, options);
    throw err;
  } finally {
    worker.terminate();
  }
}

function inWorker(
  worker: Worker,
  bytes: ArrayBuffer,
  options: ReadWorkbookOptions,
  signal: AbortSignal | undefined,
): Promise<SheetRows[]> {
  return new Promise<SheetRows[]>((resolve, reject) => {
    const onAbort = () => reject(signal?.reason ?? new Error('Aborted'));
    signal?.addEventListener('abort', onAbort, { once: true });
    const settle = (fn: () => void) => {
      signal?.removeEventListener('abort', onAbort);
      fn();
    };

    worker.onmessage = (e: MessageEvent<ReadResponse>) =>
      settle(() => (e.data.ok ? resolve(e.data.sheets) : reject(new Error(e.data.message))));
    // The worker traps its own parse errors and replies `{ ok: false }`, so
    // reaching here means the script never ran.
    worker.onerror = () => settle(() => reject(new WorkerUnavailable()));

    const request: ReadRequest = { bytes, options };
    worker.postMessage(request);
  });
}

/** Marks "no worker to be had" — the one failure that falls back rather than
 *  surfacing, so it must not be confused with a parse error or an abort. */
class WorkerUnavailable extends Error {}

/** One worker per read, terminated when it resolves — a parse is a one-shot job,
 *  and a fresh thread costs ~10ms against a multi-second parse. */
function spawn(): Worker | null {
  try {
    return new Worker(new URL('./sheets.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

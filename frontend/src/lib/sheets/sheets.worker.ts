import { readWorkbookRows, type ReadWorkbookOptions, type SheetRows } from './reader';

export interface ReadRequest {
  bytes: ArrayBuffer;
  options: ReadWorkbookOptions;
}

export type ReadResponse = { ok: true; sheets: SheetRows[] } | { ok: false; message: string };

/** Cast rather than `/// <reference lib="webworker" />`: that lib re-declares
 *  `self` and collides with the DOM lib the rest of the app compiles against. */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ReadRequest>) => void) | null;
  postMessage: (message: ReadResponse) => void;
};

ctx.onmessage = async (e) => {
  try {
    const sheets = await readWorkbookRows(e.data.bytes, e.data.options);
    ctx.postMessage({ ok: true, sheets });
  } catch (err) {
    ctx.postMessage({ ok: false, message: (err as Error)?.message || 'Unreadable spreadsheet' });
  }
};

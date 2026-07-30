import { JSDOM } from 'jsdom';

/**
 * The four browser globals `editorjs.ts` reaches for, provided by JSDOM.
 *
 * That module is shared verbatim with the browser (see `scripts/sync-shared.ts`),
 * and it is careful: every DOM global it uses is behind a
 * `typeof … === 'undefined'` guard, so it *runs* in Node with or without this.
 * That is exactly why this file exists and why `assertDom` is not paranoia —
 * without the globals, `htmlToBlocks` doesn't throw, it quietly returns the whole
 * page as one paragraph of escaped markup. A page would mirror back as garbage
 * with nothing in the log to say why.
 *
 * One JSDOM window for the process. Parsing is synchronous and the parser holds
 * no state between calls, so there is nothing to serialise — unlike the BlockNote
 * server util this replaced, which swapped globals in and out around every call
 * and needed a queue to keep two conversions from seeing each other's document.
 */
let installed = false;

export function installDom(): void {
  if (installed) return;
  const { window } = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window ??= window;
  globals.document ??= window.document;
  globals.DOMParser ??= window.DOMParser;
  globals.Node ??= window.Node;
  globals.NodeFilter ??= window.NodeFilter;
  installed = true;
}

/** Throws if the shared converter would fall back to its no-DOM path. */
export function assertDom(): void {
  installDom();
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    throw new Error('DOM globals unavailable: html conversion would silently degrade');
  }
}

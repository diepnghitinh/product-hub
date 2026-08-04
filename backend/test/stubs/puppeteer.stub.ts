/**
 * Stub for `puppeteer` in the e2e run. The app pulls it in via the PDF service
 * (an ESM-only package ts-jest won't transform), but the MCP e2e never renders a
 * PDF — so a no-op default whose `launch` throws if ever reached is enough.
 */
export type Browser = unknown;
export default {
  launch: async () => {
    throw new Error('puppeteer is stubbed in the e2e run');
  },
};

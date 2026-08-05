import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    // Service worker — its ONE job is to notice a new deploy and let the app ask
    // before switching to it (src/components/UpdatePrompt.tsx). This is not an
    // installable/offline PWA: no manifest, no icons, no API caching.
    VitePWA({
      // `prompt`, never `autoUpdate`: a new build must not take over on its own.
      // Taking over means reloading the tab, and a reload throws away whatever
      // is unsaved in an Editor.js doc or a half-filled issue form.
      registerType: 'prompt',
      // Registration happens in UpdatePrompt via `virtual:pwa-register/react`,
      // so the plugin must not also inject its own <script> into index.html.
      injectRegister: null,
      // No web app manifest — we are not shipping "Add to home screen".
      manifest: false,
      workbox: {
        // Precache the shell only: index.html, the entry chunk and the CSS.
        //
        // Deliberately NOT `**/*.js`. The heavy chunks are all lazy
        // (mermaid.core 635 kB, cynefin 691 kB, cytoscape 444 kB, xlsx 429 kB,
        // katex 258 kB, ~30 diagram-* chunks) and are pulled in on demand by
        // lib/mermaid.ts and lib/sheets (inside its worker). Precaching
        // them would push ~2.5 MB at every visitor up front and undo that
        // work — they stay on the network and load only when actually used.
        //
        // Update detection does not depend on this list being exhaustive:
        // index.html embeds the hashed entry filename, so ANY code change
        // rewrites index.html, which rewrites the precache manifest, which
        // rewrites sw.js — which is what the browser compares.
        globPatterns: ['index.html', 'assets/index-*.css', 'assets/index-*.js'],
        // The entry chunk is ~1.7 MB, uncomfortably close to Workbox's 2 MiB
        // default. Over that limit a file is dropped from the precache
        // SILENTLY, so give it room rather than let the shell fall out one day.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // SPA deep links (/issues/TSK-7, /public/docs/…) resolve to the shell.
        navigateFallback: 'index.html',
        // Never answer an API call with the HTML shell. In production the API is
        // a separate origin (the SW only ever sees same-origin navigations), but
        // .env / the Dockerfile both document `/v1` same-origin as a supported
        // setup — this keeps that configuration safe too.
        navigateFallbackDenylist: [/^\/v1\//],
        // Drop the previous build's precache once the new SW activates.
        cleanupOutdatedCaches: true,
      },
      // No SW in `npm run dev`: it would serve a cached shell over Vite's HMR
      // and turn every edit into a debugging session.
      devOptions: { enabled: false },
    }),
  ],
  worker: {
    // ES, not Vite's default IIFE. The spreadsheet worker (`lib/sheets`) loads
    // SheetJS with a dynamic import so the 429 kB parser stays out of the main
    // bundle — and a dynamic import means code-splitting, which an IIFE bundle
    // cannot express ("UMD and IIFE output formats are not supported for
    // code-splitting builds"). Every worker here is constructed with
    // `{ type: 'module' }` to match, and `readWorkbook` parses inline if a
    // browser can't start one.
    format: 'es',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Yjs must exist exactly once in the bundle. Two copies do not error — they
    // simply fail to recognise each other's types, and collaborative editing
    // goes quiet with no message anywhere. BlockNote and @hocuspocus/provider
    // both depend on it, so the dedupe is stated rather than left to hoisting.
    dedupe: ['yjs', 'y-protocols', 'y-prosemirror'],
  },
  server: {
    port: 3001,
    host: true,
  },
});

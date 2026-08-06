export const env = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/v1',
  /**
   * The Yjs sync server (see `collab/`). Empty means collaborative editing is
   * off and doc pages use the single-writer editor — which is the whole feature
   * flag: no build of the app depends on the service being reachable.
   *
   * Takes either an absolute URL (`ws://localhost:3002` in dev, where the service
   * is its own origin) or a same-origin path (`/collab` in production, where
   * nginx proxies it — see deploy/nginx.web.conf). Use {@link collabWsUrl} and
   * {@link collabHttpUrl} rather than reading this: one of the two forms always
   * needs rewriting, and doing it at each call site is how they drift apart.
   */
  collabUrl: import.meta.env.VITE_COLLAB_URL || '',
};

/** Whether real-time collaborative doc editing is available in this build. */
export const collabEnabled = (): boolean => !!env.collabUrl;

/**
 * Whether `/design-patterns` — the component gallery we build the UI against —
 * exists in this build. It is a *development* reference, not a product feature:
 * useful while writing components, noise in a workspace someone actually works in.
 * So it ships in `npm run dev` and in nothing else.
 *
 * `import.meta.env.DEV` is false for any `vite build`, whatever `--mode` names it
 * (the Docker image builds `--mode prod`; see frontend/Dockerfile). Read it as
 * "the dev server is serving this", not "the mode string says production".
 *
 * A plain `const`, deliberately: Vite substitutes the literal `false` at build
 * time, so the route and both menu rows fold away and the page itself is dropped
 * from the bundle — it isn't hidden behind a check, it isn't there.
 */
export const designPatternsEnabled: boolean = import.meta.env.DEV;

/** `/collab` → `wss://app.acme.com/collab`; an absolute URL is left alone. */
export function collabWsUrl(): string {
  const configured = env.collabUrl.replace(/\/+$/, '');
  if (!configured) return '';
  if (/^wss?:\/\//i.test(configured)) return configured;
  if (/^https?:\/\//i.test(configured)) return configured.replace(/^http/i, 'ws');
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}${configured.startsWith('/') ? '' : '/'}${configured}`;
}

/**
 * The same service's plain HTTP endpoints (`/health`, `/presence`, `/reset`),
 * derived from the one variable so the two can't point at different servers.
 */
export function collabHttpUrl(path: string): string {
  const ws = collabWsUrl();
  if (!ws) return '';
  return `${ws.replace(/^ws/i, 'http')}${path}`;
}

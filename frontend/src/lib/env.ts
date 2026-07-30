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

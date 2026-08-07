import type { Request } from 'express';

/**
 * Working out the public address of this API, for the webhook URLs we hand to
 * an outside system to call back on.
 *
 * Shared by the git integrations (an admin pastes the URL into the repo) and
 * ClickUp (we register the URL with ClickUp ourselves). Same problem, and a
 * second copy would be a second place for it to go subtly wrong.
 */

/** Last resort only: a request with no Host header at all can't happen over HTTP/1.1. */
const NO_HOST_FALLBACK = 'http://localhost:3000';

/** First value of a header that may arrive repeated or comma-joined ("a, b"). */
const firstValue = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() ?? '';

/** Loopback / private / .local — an address only this network can dial. */
export const isLocalHost = (hostHeader: string): boolean => {
  const host = hostHeader
    .replace(/:\d+$/, '')
    .replace(/^\[|]$/g, '')
    .toLowerCase();
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
};

/**
 * Public origin of this API — the half of the webhook URL that has to be
 * reachable from GitHub / GitLab / ClickUp.
 *
 * `API_BASE_URL` wins when it's set, and it's the only way to describe an odd
 * topology. But it usually *isn't* set: the runtime image ships no env file
 * (`backend/.dockerignore` drops them), so every deployment supplies its own
 * variables — and the one nobody knew to add silently stayed the old
 * `http://localhost:3000` default. That URL fails in the worst way: it looks
 * like a real value, and GitLab refuses it outright ("Url is blocked: Requests
 * to localhost are not allowed").
 *
 * So the fallback is the address this very request arrived on. Behind a proxy
 * that lives in `X-Forwarded-*`, and whatever it says, it is by definition an
 * address that just reached us from outside — which is exactly the property the
 * webhook URL needs.
 *
 * @param configuredBaseUrl `API_BASE_URL`, already trimmed of trailing slashes.
 */
export function publicOriginFor(req: Request, configuredBaseUrl: string): string {
  if (configuredBaseUrl) return configuredBaseUrl;

  const host = firstValue(req.headers['x-forwarded-host']) || req.headers.host || '';
  if (!host) return NO_HOST_FALLBACK;

  // A public host is https in practice: TLS terminates at the edge, and the
  // proxy may forward the *internal* hop's scheme instead (Traefik on an http
  // entrypoint behind Cloudflare does exactly that). Handing back an http URL
  // there would put every payload — and the signing secret — on the wire in the
  // clear. Local and private hosts keep the scheme they arrived with.
  const proto = firstValue(req.headers['x-forwarded-proto']) || req.protocol || 'http';
  return `${isLocalHost(host) ? proto : 'https'}://${host}`;
}

/** `API_BASE_URL` as this module wants it: trimmed, no trailing slash. */
export function normaliseBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

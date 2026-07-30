import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Extension, onRequestPayload } from '@hocuspocus/server';
import type { Db } from 'mongodb';
import { canWrite, roomName, verifyToken, type CollabContext } from './auth.js';
import { resetYDocFromHtml } from './ydoc.js';
import { env } from './env.js';
import { pages } from './mongo.js';
import { openRoomCount } from './rooms.js';
import { roomsWithViewers, viewersFor } from './presence.js';
import { log, reason } from './log.js';

/** How many pages one presence call may ask about. */
const MAX_PAGES_PER_QUERY = 200;

/**
 * The plain HTTP endpoints this service answers next to the WebSocket:
 *
 *   GET  /health   — for the container healthcheck, unauthenticated
 *   GET  /presence?pages=<id>,<id> — who is in these pages, for the docs list
 *   POST /reset?page=<id> — re-read this page's stored HTML into its live Y.Doc
 *
 * Everything else falls through to Hocuspocus's own response.
 */
export function http(db: Db): Extension {
  return {
    extensionName: 'Http',

    async onRequest({ request, response, instance }: onRequestPayload) {
      const url = new URL(request.url ?? '/', 'http://localhost');
      cors(request, response);

      if (request.method === 'OPTIONS') {
        response.writeHead(204).end();
        return handled();
      }

      if (url.pathname === '/health') {
        send(response, 200, {
          ok: true,
          env: env.nodeEnv,
          documents: instance.getDocumentsCount(),
          connections: instance.getConnectionsCount(),
          rooms: openRoomCount(),
          roomsWithViewers: roomsWithViewers(),
        });
        return handled();
      }

      if (url.pathname === '/presence') {
        try {
          const token = verifyToken(bearer(request));
          const pageIds = (url.searchParams.get('pages') ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
            .slice(0, MAX_PAGES_PER_QUERY);

          send(response, 200, { viewers: viewersFor(token.tenantId, pageIds) });
        } catch (error) {
          // Any token problem is the same answer — don't help a caller work out
          // whether a token was expired, forged, or simply absent.
          log.warn('presence rejected', { error: reason(error) });
          send(response, 401, { message: 'unauthorized' });
        }
        return handled();
      }

      /**
       * Version restore, reaching the people who are mid-sentence.
       *
       * The API has already written the restored body to `docpages.content` and
       * snapshotted what it replaced — that half is unchanged and still the
       * record of truth. What it cannot do is reach the Y.Doc, and while anyone
       * is connected the Y.Doc is what they are looking at: a restore that only
       * touched Mongo would be overwritten by the next keystroke and the mirror
       * would put the old text straight back.
       *
       * So this reads the page back and applies it to the room as Yjs
       * operations. `openDirectConnection` is deliberate: it loads the document
       * if nobody has it open, which makes a restore behave the same whether the
       * page has an audience or not, and its disconnect runs the normal store
       * and mirror hooks.
       */
      if (url.pathname === '/reset') {
        // Two try blocks on purpose. A bad token is a 401 and a client's problem;
        // a conversion that throws is a 500 and ours. Folding them together would
        // have the app retry a login over a bug in the renderer.
        let token;
        try {
          token = verifyToken(bearer(request));
        } catch (error) {
          log.warn('reset rejected', { error: reason(error) });
          send(response, 401, { message: 'unauthorized' });
          return handled();
        }

        if (request.method !== 'POST') {
          send(response, 405, { message: 'method not allowed' });
          return handled();
        }
        // Same gate as editing the body — a restore *is* an edit of the body.
        if (!canWrite(token.role)) {
          send(response, 403, { message: 'forbidden' });
          return handled();
        }

        const pageId = (url.searchParams.get('page') ?? '').trim();
        if (!pageId) {
          send(response, 400, { message: 'page is required' });
          return handled();
        }

        try {
          // Tenant-scoped, so a page id from another workspace reads as absent
          // rather than as a page somebody may not have.
          const page = await pages(db).findOne(
            { _id: pageId, tenantId: token.tenantId },
            { projection: { content: 1 } },
          );
          if (!page) {
            send(response, 404, { message: 'page not found' });
            return handled();
          }

          const connection = await instance.openDirectConnection(
            roomName(token.tenantId, pageId),
            { ...token, canWrite: true } satisfies CollabContext,
          );
          try {
            if (!connection.document) throw new Error('document unavailable');
            resetYDocFromHtml(connection.document, page.content ?? '');
          } finally {
            // Stores and, if we were the only one here, unloads. In `finally`:
            // a failed conversion must still close the connection, or the room
            // stays pinned open for the life of the process.
            await connection.disconnect();
          }

          log.info('document reset from html', {
            page: pageId,
            bytes: page.content?.length ?? 0,
          });
          send(response, 200, { ok: true });
        } catch (error) {
          log.error('reset failed', { page: pageId, error: reason(error) });
          send(response, 500, { message: 'reset failed' });
        }
        return handled();
      }

      return;
    },
  };
}

/**
 * Tells Hocuspocus we've written the response ourselves.
 *
 * Its request handler writes a default 200 unless the hook rejects, and swallows
 * a rejection with a falsy value (see Server.requestHandler) — so this is the
 * documented way to take over a request rather than a trick.
 */
function handled(): Promise<never> {
  return Promise.reject();
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

/**
 * WebSocket upgrades aren't subject to CORS, so this only matters for the
 * presence read and the restore POST — which the app makes from :3001 in dev and
 * same-origin through nginx in Compose.
 */
function cors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (origin && env.allowedOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Max-Age', '600');
  }
}

function bearer(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim();
}

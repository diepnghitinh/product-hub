import { Server, type onAuthenticatePayload } from '@hocuspocus/server';
import type { Db } from 'mongodb';
import {
  assertRoomBelongsToToken,
  canRead,
  canWrite,
  parseRoom,
  verifyToken,
  type CollabContext,
  type Room,
  type TokenPayload,
} from './auth.js';
import { env } from './env.js';
import { http } from './http.js';
import { log, reason } from './log.js';
import { mirror } from './mirror.js';
import { closeMongo, docs, pages } from './mongo.js';
import { persistence } from './persistence.js';
import { presence } from './presence.js';

/**
 * Two reads at connect time: the page, to learn which doc it belongs to, and the
 * doc, to learn whether this reader may have it. Both are indexed point lookups
 * and they happen once per socket, not per keystroke.
 *
 * A page with no doc row is *refused*, not waved through — that's a page whose
 * container was deleted mid-session, and the safe reading of "I can't tell whose
 * this is" is no.
 */
async function assertPageIsReadable(db: Db, room: Room, token: TokenPayload): Promise<void> {
  const page = await pages(db).findOne(
    { _id: room.pageId, tenantId: room.tenantId },
    { projection: { docId: 1 } },
  );
  // A page id nobody has written to yet is legitimate — the API creates the row
  // before the editor first connects, so a miss here means it isn't ours.
  if (!page) throw new Error('page not found');

  const doc = await docs(db).findOne(
    { _id: page.docId, tenantId: room.tenantId },
    { projection: { createdBy: 1, isPrivate: 1 } },
  );
  if (!doc) throw new Error('doc not found');
  // Same words as the API's 404: whether the doc exists isn't this caller's to know.
  if (!canRead(doc, token)) throw new Error('doc not found');
}

export interface ServerOptions {
  /** Overridden by the integration test so it can't collide with a running instance. */
  port?: number;
  /** The test manages its own database handle and closes it itself. */
  closeMongoOnDestroy?: boolean;
}

/**
 * The collab server, assembled but not listening.
 *
 * Split from the entry point so the integration test can run the real thing
 * in-process — the alternative is a test that only exercises a copy of the
 * wiring, which is exactly the wiring most likely to be wrong.
 */
export function createCollabServer(db: Db, options: ServerOptions = {}): Server<CollabContext> {
  const { port = env.port, closeMongoOnDestroy = true } = options;

  return new Server<CollabContext>({
    name: 'product-hub-collab',
    port,
    debounce: env.storeDebounceMs,
    maxDebounce: env.storeMaxDebounceMs,
    quiet: env.nodeEnv !== 'local',

    /**
     * The gate. Everything after this point trusts `context`, so this is the one
     * place that decides who a connection is and what it may do.
     */
    async onAuthenticate({ token, documentName, connectionConfig }: onAuthenticatePayload) {
      try {
        const payload = verifyToken(token);
        const room = parseRoom(documentName);
        // A valid token for workspace A must not open a page in workspace B,
        // even with a correct page id.
        assertRoomBelongsToToken(room, payload);

        // The room name is a page id, and until now that was the whole key: any
        // signed-in member of the workspace who had one could open the live
        // document behind it. A private doc has to be private here too, or the
        // editor is a way around every check the API makes.
        await assertPageIsReadable(db, room, payload);

        const writable = canWrite(payload.role);
        // Mirrors the API's @Roles on PATCH /docs/:id/pages/:pageId. A read-only
        // connection still receives updates and still broadcasts its own cursor,
        // so watching someone write a spec works without granting write access.
        connectionConfig.readOnly = !writable;

        log.info('connected', {
          user: payload.email || payload.userId,
          role: payload.role,
          page: room.pageId,
          mode: writable ? 'write' : 'read-only',
        });

        return { ...payload, canWrite: writable } satisfies CollabContext;
      } catch (error) {
        // Throwing closes the socket. Log it — from the client this looks like
        // an editor that silently never connects.
        log.warn('authentication rejected', { room: documentName, error: reason(error) });
        throw error;
      }
    },

    extensions: [persistence(db), mirror(db), presence(), http(db)],

    async onDestroy() {
      // Hocuspocus owns the signal handlers and exits after this hook, so the
      // database connection has to be closed from here.
      if (closeMongoOnDestroy) await closeMongo();
      log.info('stopped');
    },
  });
}

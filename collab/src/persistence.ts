import type {
  Extension,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
  afterUnloadDocumentPayload,
} from '@hocuspocus/server';
import { Binary, type Db } from 'mongodb';
import * as Y from 'yjs';
import { parseRoom } from './auth.js';
import { blocksOf } from './blockDoc.js';
import { seedYDocFromHtml } from './ydoc.js';
import { crdt, pages } from './mongo.js';
import { forgetRoom, getRoom, rememberRoom } from './rooms.js';
import { log, reason } from './log.js';

/**
 * Where a doc page's collaborative state lives.
 *
 * The Yjs update log in `docpagecrdts` is the truth while editing: it is what
 * merges two people typing in the same paragraph. `docpages.content` stays as
 * the readable HTML mirror (see mirror.ts) so everything already reading it —
 * PDF export, public share links, MCP, version snapshots — keeps working
 * untouched.
 */
export function persistence(db: Db): Extension {
  return {
    extensionName: 'MongoPersistence',

    /**
     * First client into a room. Either we have Yjs state for the page, or this
     * page has never been opened collaboratively and we build its state from
     * the HTML the Editor.js era left behind — which is what makes every
     * existing doc simply work rather than open blank.
     */
    async onLoadDocument({ documentName, document }: onLoadDocumentPayload) {
      const { tenantId, pageId } = parseRoom(documentName);

      // Scoped by tenant, not just id: the room name was checked against the
      // caller's token, and this is the second lock on the same door.
      const page = await pages(db).findOne(
        { _id: pageId, tenantId },
        { projection: { content: 1, docId: 1 } },
      );
      if (!page) throw new Error(`page not found: ${pageId}`);

      rememberRoom(documentName, { tenantId, pageId, docId: page.docId });

      const stored = await crdt(db).findOne({ _id: pageId, tenantId });
      if (stored) {
        Y.applyUpdate(document, new Uint8Array(stored.state.buffer));
        // Stored state that holds no blocks is state from a different editor —
        // the ProseMirror fragment the BlockNote build wrote. It is not
        // convertible and it is not needed: that build mirrored every save into
        // `content`, so the page's HTML is current and re-seeding from it loses
        // nothing but a history nobody can read. Without this the room would
        // open blank *and* the mirror would then write that blank over the body.
        if (blocksOf(document).length) {
          log.info('document loaded', { page: pageId, revision: stored.revision });
          return;
        }
        log.warn('stored state has no blocks — reseeding from html', { page: pageId });
      }

      // Migration, one page at a time, at the moment it's first needed. There is
      // no batch job to run and no flag day: a page converts when somebody opens
      // it, and its HTML is still sitting in `content` if we ever need to look.
      seedYDocFromHtml(document, page.content ?? '');
      log.info('document seeded from html', {
        page: pageId,
        bytes: page.content?.length ?? 0,
      });
    },

    /**
     * Debounced by the server (see env.storeDebounceMs). We write the whole
     * encoded state rather than appending updates: a page is small, and a single
     * document means loading is one read with no log to compact.
     */
    async onStoreDocument({ documentName, document }: onStoreDocumentPayload) {
      const room = getRoom(documentName);
      if (!room) {
        // Only reachable if a store outlives its load, which would mean the
        // room registry and Hocuspocus disagree — log it rather than write a
        // row we can't attribute to a tenant.
        log.warn('store skipped: unknown room', { room: documentName });
        return;
      }

      const state = Buffer.from(Y.encodeStateAsUpdate(document));
      await crdt(db).updateOne(
        { _id: room.pageId },
        {
          $set: {
            tenantId: room.tenantId,
            docId: room.docId,
            state: new Binary(state),
            updatedAt: new Date(),
          },
          $inc: { revision: 1 },
        },
        { upsert: true },
      );
    },

    async afterUnloadDocument({ documentName }: afterUnloadDocumentPayload) {
      forgetRoom(documentName);
    },
  };
}

/** Shared by the hooks above and the mirror, so failures read the same way. */
export function logHookFailure(hook: string, documentName: string, error: unknown): void {
  log.error(`${hook} failed`, { room: documentName, error: reason(error) });
}

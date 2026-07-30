import type { Extension, afterStoreDocumentPayload } from '@hocuspocus/server';
import type { Db } from 'mongodb';
import type { CollabContext } from './auth.js';
import { blocksOf } from './blockDoc.js';
import { ydocToHtml } from './ydoc.js';
import { pages } from './mongo.js';
import { logHookFailure } from './persistence.js';
import { getRoom } from './rooms.js';
import { log } from './log.js';

/**
 * Keeps `docpages.content` in step with the CRDT.
 *
 * This is the decision that let collaborative editing land without rewriting
 * the rest of the docs feature: eight places on the API read a page's body as
 * HTML — PDF export, the print stylesheet, public share links, MCP, the mapper,
 * version snapshots — and every one of them keeps reading exactly what it read
 * before. The Y.Doc is the truth for *editing*; this is the truth for *reading*.
 *
 * Runs in `afterStoreDocument`, never `onStoreDocument`, so a rendering problem
 * can only ever cost a stale mirror — never the actual keystrokes.
 */
export function mirror(db: Db): Extension {
  return {
    extensionName: 'HtmlMirror',

    async afterStoreDocument({
      documentName,
      document,
      lastContext,
    }: afterStoreDocumentPayload<CollabContext>) {
      const room = getRoom(documentName);
      if (!room) return;

      // A document with no blocks at all has not been filled in yet — it is not
      // an empty page. (Clearing a page leaves the editor's one empty paragraph,
      // which does render as `''` and does get written.) Mirroring it would put
      // an empty body over a page whose HTML is the only copy left.
      if (!blocksOf(document).length) return;

      try {
        const html = ydocToHtml(document);

        // Read before write: the store hook is debounced, so it fires on a pause
        // in typing even when the pause produced no change (a cursor move, an
        // awareness update). Writing regardless would move `updatedAt` and make
        // the "edited 2 minutes ago" byline claim an edit that never happened.
        const current = await pages(db).findOne(
          { _id: room.pageId, tenantId: room.tenantId },
          { projection: { content: 1 } },
        );
        if (current?.content === html) return;

        await pages(db).updateOne(
          { _id: room.pageId, tenantId: room.tenantId },
          {
            $set: {
              content: html,
              updatedAt: new Date(),
              // Whoever's edit triggered this store gets the byline, matching
              // what the REST PATCH would have recorded.
              ...(lastContext?.userId
                ? { updatedBy: lastContext.userId, updatedByName: lastContext.name }
                : {}),
            },
          },
        );

        log.info('mirror written', { page: room.pageId, bytes: html.length });
      } catch (error) {
        logHookFailure('mirror', documentName, error);
      }
    },
  };
}

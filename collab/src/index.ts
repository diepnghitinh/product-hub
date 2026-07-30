import { env } from './env.js';
import { log, reason } from './log.js';
import { connectMongo } from './mongo.js';
import { createCollabServer } from './server.js';

/**
 * product-hub collab — the Yjs sync server behind collaborative doc editing.
 *
 * Clients connect with the same access token they use for the REST API, to a
 * room named `<tenantId>:<pageId>`. From there Hocuspocus relays document
 * updates and awareness (the other person's caret and selection), while the
 * extensions in server.ts give it somewhere to live:
 *
 *   persistence — the Yjs state, in `docpagecrdts`
 *   mirror      — rendered HTML back into `docpages.content`, for everything else
 *   presence    — who's in a page, readable over HTTP for the docs list
 *   http        — /health and /presence
 */
async function main(): Promise<void> {
  const db = await connectMongo();
  const server = createCollabServer(db);
  await server.listen();
  log.info('collab listening', { port: env.port, env: env.nodeEnv });
}

main().catch((error) => {
  log.error('failed to start', { error: reason(error) });
  process.exit(1);
});

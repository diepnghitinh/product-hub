/**
 * One-time BACKFILL: replace legacy UUID share tokens on docs with short ones,
 * so a shared link reads `/public/docs/K7M4PQ2XR9TVBD` instead of
 * `/public/docs/1375d310-1074-4687-8ecb-2e78d5c6296a`. New shares already mint a
 * short token (see `keepOrUpgradeShareToken` in shared/utils/short-id.util.ts);
 * this brings docs shared before that change into line.
 *
 *   npm run backfill:doc-share-tokens              # DRY RUN — plan only
 *   npm run backfill:doc-share-tokens -- --apply   # rewrite the tokens
 *
 * ⚠️ A rewritten token INVALIDATES the old link — anyone holding the UUID URL
 * gets "not available" and needs the new one. That is the point of the change,
 * but it is not undoable, so the old token is printed for every doc it touches.
 *
 * Safe to re-run (idempotent): a short token has no hyphen, so a second run
 * matches nothing. Docs that were never shared have no token and are skipped.
 * A prod run needs an explicit MONGODB_URI (it won't silently hit localhost).
 */
import mongoose from 'mongoose';
import { shareToken } from '../src/shared/utils/short-id.util';

const APPLY = process.argv.includes('--apply');

const NODE_ENV = process.env['NODE_ENV'] || 'local';
const IS_PROD = NODE_ENV === 'prod' || NODE_ENV === 'production';
const DEFAULT_MONGODB_URI =
  'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

if (IS_PROD && !process.env.MONGODB_URI) {
  console.error(
    '✋ NODE_ENV=prod but MONGODB_URI is not set (would fall back to localhost).\n' +
      '   Set the production MONGODB_URI before backfilling anything.',
  );
  process.exit(1);
}

// A legacy token is a UUID; the short alphabet contains no hyphen.
const LEGACY = { publicToken: { $regex: '-' } };

async function main(): Promise<void> {
  console.log(
    APPLY ? '🔗 APPLY — shortening legacy doc share tokens' : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const docs = db.collection('docs');
  const legacy = await docs.find(LEGACY).toArray();

  if (!legacy.length) {
    console.log('\nNo legacy UUID share tokens — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  let changed = 0;
  for (const doc of legacy) {
    const next = shareToken();
    console.log(
      `\n• ${String(doc.title)} ${doc.publicEnabled ? '(shared)' : '(sharing off)'}` +
        `\n    old: ${String(doc.publicToken)}` +
        `\n    new: ${next}`,
    );
    if (APPLY) {
      await docs.updateOne({ _id: doc._id }, { $set: { publicToken: next } });
      changed++;
    }
  }

  console.log('\n────────────────────────────────');
  console.log(
    APPLY
      ? `✅ Shortened ${changed} share token(s). The old links no longer resolve.`
      : `Would shorten ${legacy.length} share token(s).`,
  );
  if (!APPLY) {
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:doc-share-tokens -- --apply');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

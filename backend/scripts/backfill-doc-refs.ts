/**
 * One-time BACKFILL: give every existing doc a `DOC-…` ref, so its detail URL
 * reads `/docs/DOC-6HCUHKX/getting-started-622436d1` instead of a pair of UUIDs.
 * Docs created from now on mint one on create (`CreateDocUseCase`); this brings
 * the ones written before refs existed into line.
 *
 *   npm run backfill:doc-refs              # DRY RUN — plan only
 *   npm run backfill:doc-refs -- --apply   # write the refs
 *
 * Purely additive and non-destructive: the uuid `_id` stays the doc's identity,
 * every existing `/docs/<uuid>` link keeps resolving (the API accepts both), and
 * a doc that already has a ref is never re-minted — a ref that moved would break
 * links already handed out.
 *
 * Safe to re-run (idempotent): only docs with a missing/empty ref are touched.
 * A prod run needs an explicit MONGODB_URI (it won't silently hit localhost).
 */
import mongoose from 'mongoose';
import { randomRef } from '../src/shared/utils/short-id.util';

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

const MISSING = { $or: [{ ref: { $exists: false } }, { ref: '' }, { ref: null }] };

async function main(): Promise<void> {
  console.log(APPLY ? '🔖 APPLY — minting doc refs' : '🔎 DRY RUN — plan only, no changes');
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const docs = db.collection('docs');
  const pending = await docs.find(MISSING).toArray();

  if (!pending.length) {
    console.log('\nEvery doc already has a ref — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Uniqueness is per tenant, and the collection is small enough to hold the
  // taken set in memory — cheaper and more reliable than a query per mint.
  const taken = new Map<string, Set<string>>();
  for (const d of await docs.find({ ref: { $type: 'string', $gt: '' } }).toArray()) {
    const key = String(d.tenantId);
    if (!taken.has(key)) taken.set(key, new Set());
    taken.get(key)!.add(String(d.ref));
  }

  let changed = 0;
  for (const doc of pending) {
    const tenant = String(doc.tenantId);
    if (!taken.has(tenant)) taken.set(tenant, new Set());
    const seen = taken.get(tenant)!;
    let ref = randomRef('DOC');
    while (seen.has(ref)) ref = randomRef('DOC');
    seen.add(ref);

    console.log(`\n• ${String(doc.title)}\n    ${String(doc._id)}  →  ${ref}`);
    if (APPLY) {
      await docs.updateOne({ _id: doc._id }, { $set: { ref } });
      changed++;
    }
  }

  console.log('\n────────────────────────────────');
  console.log(
    APPLY
      ? `✅ Minted ${changed} doc ref(s). Old /docs/<uuid> links still resolve.`
      : `Would mint ${pending.length} doc ref(s).`,
  );
  if (!APPLY) {
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:doc-refs -- --apply');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

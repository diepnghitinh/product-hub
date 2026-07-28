/**
 * One-time BACKFILL: mint a short ref (`RM-6HCUHKX`) for roadmap items created
 * before refs existed, so their URL reads
 * `/roadmaps/<roadmap>/items/RM-6HCUHKX` instead of a raw uuid. New items already
 * get one (see `mintItemRef` in application/roadmaps/use-cases), and any edit to
 * a roadmap fills the gaps for that roadmap — this does the whole workspace at
 * once instead of waiting for someone to touch each board.
 *
 *   npm run backfill:roadmap-item-refs              # DRY RUN — plan only
 *   npm run backfill:roadmap-item-refs -- --apply   # write the refs
 *
 * ADDITIVE and safe: `id` is untouched, so comments, favourites, linked issues
 * and any URL already handed out keep resolving — the app accepts a ref or a
 * uuid. Safe to re-run (idempotent): items that already have a ref are skipped.
 * A prod run needs an explicit MONGODB_URI (it won't silently hit localhost).
 */
import mongoose from 'mongoose';
import { randomRef } from '../src/shared/utils/short-id.util';
import { ROADMAP_ITEM_REF_PREFIX } from '../src/application/roadmaps/domain/types/roadmap-item.type';

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

interface Item {
  id: string;
  shortId?: string;
  title?: string;
}

/** A ref no item in this roadmap already holds — refs only have to be unique
 *  within the roadmap they live in, which is the scope a URL resolves in. */
function mint(taken: Set<string>): string {
  for (let i = 0; i < 5; i++) {
    const ref = randomRef(ROADMAP_ITEM_REF_PREFIX);
    if (!taken.has(ref)) {
      taken.add(ref);
      return ref;
    }
  }
  throw new Error('Could not mint a free ref after 5 tries — that should be impossible');
}

async function main(): Promise<void> {
  console.log(
    APPLY ? '🔗 APPLY — minting refs for roadmap items' : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const roadmaps = db.collection('roadmaps');
  const all = await roadmaps.find({}).toArray();

  let boards = 0;
  let minted = 0;
  for (const doc of all) {
    const items = (doc.items ?? []) as Item[];
    const missing = items.filter((i) => !i.shortId);
    if (!missing.length) continue;

    const taken = new Set(items.map((i) => i.shortId).filter((r): r is string => !!r));
    const next = items.map((i) => (i.shortId ? i : { ...i, shortId: mint(taken) }));

    boards++;
    minted += missing.length;
    console.log(`\n• ${String(doc.title)} — ${missing.length} item(s) without a ref`);
    for (const item of next) {
      if (missing.some((m) => m.id === item.id)) {
        console.log(`    ${item.shortId}  ${item.title || '(untitled)'}`);
      }
    }
    if (APPLY) await roadmaps.updateOne({ _id: doc._id }, { $set: { items: next } });
  }

  console.log('\n────────────────────────────────');
  if (!minted) {
    console.log('Every roadmap item already has a ref — nothing to do.');
  } else if (APPLY) {
    console.log(`✅ Minted ${minted} ref(s) across ${boards} roadmap(s). Old uuid links still work.`);
  } else {
    console.log(`Would mint ${minted} ref(s) across ${boards} roadmap(s).`);
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:roadmap-item-refs -- --apply');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

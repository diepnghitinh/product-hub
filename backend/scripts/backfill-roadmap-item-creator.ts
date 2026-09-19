/**
 * One-time BACKFILL: fill in `createdById` / `createdByName` on roadmap items
 * that predate the board storing a creator.
 *
 * The board's Filter menu now narrows by creator, and live code stamps one on
 * every item it creates (see `ReplaceRoadmapItemsUseCase`). Items created before
 * that store nothing — and the use-case deliberately does NOT fill a blank one in
 * on the next save, because the next save is usually someone else dragging a
 * card, which would credit the whole backlog to them.
 *
 * There is one honest source for the old ones: the `created` activity row each
 * item got when it first appeared (`auditlogs`, entity `roadmap_item`, field
 * `created`), which carries the actor who did it. This reads that row and copies
 * its actor onto the item. Items older than the activity log itself have no row
 * and are left blank — they filter as "no creator", which is true, rather than
 * being attributed to a guess.
 *
 *   npm run backfill:roadmap-item-creator              # DRY RUN — plan only
 *   npm run backfill:roadmap-item-creator -- --apply   # write the creators
 *
 * ADDITIVE and safe: nothing else on the item is touched, and an item that
 * already has a creator is skipped, so it is idempotent and safe to re-run.
 * A prod run needs an explicit MONGODB_URI (it won't silently hit localhost).
 */
import mongoose from 'mongoose';

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
  title?: string;
  createdById?: string;
  createdByName?: string;
}

/** Actor of the `created` row, per item id. USER rows only — an item a bot
 *  created is genuinely the bot's, but the filter lists people, so crediting a
 *  bot id there would only ever be an option nobody matches. */
async function creatorsByItemId(
  db: NonNullable<mongoose.Connection['db']>,
): Promise<Map<string, { id: string; name: string }>> {
  const rows = await db
    .collection('auditlogs')
    .find(
      { entity: 'roadmap_item', field: 'created' },
      { projection: { entityId: 1, actorId: 1, actorName: 1, createdAt: 1 } },
    )
    // Oldest first, so an item that somehow has two `created` rows keeps the
    // first — the one that actually was its creation.
    .sort({ createdAt: 1 })
    .toArray();

  const out = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    const itemId = String(row.entityId ?? '');
    const actorId = String(row.actorId ?? '');
    if (!itemId || !actorId || out.has(itemId)) continue;
    out.set(itemId, { id: actorId, name: String(row.actorName ?? '') });
  }
  return out;
}

async function main(): Promise<void> {
  console.log(
    APPLY
      ? '👤 APPLY — filling in roadmap item creators'
      : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const creators = await creatorsByItemId(db);
  console.log(`\nFound ${creators.size} roadmap item(s) with a 'created' activity row.`);

  const roadmaps = db.collection('roadmaps');
  const all = await roadmaps.find({}).toArray();

  let boards = 0;
  let filled = 0;
  let unknown = 0;
  for (const doc of all) {
    const items = (doc.items ?? []) as Item[];
    const missing = items.filter((i) => !i.createdById);
    if (!missing.length) continue;

    const recoverable = missing.filter((i) => creators.has(i.id));
    unknown += missing.length - recoverable.length;
    if (!recoverable.length) continue;

    const next = items.map((item) => {
      const found = item.createdById ? undefined : creators.get(item.id);
      return found ? { ...item, createdById: found.id, createdByName: found.name } : item;
    });

    boards++;
    filled += recoverable.length;
    console.log(`\n• ${String(doc.title)} — ${recoverable.length} item(s) recovered`);
    for (const item of recoverable) {
      console.log(`    ${item.title || '(untitled)'} → ${creators.get(item.id)?.name || '(unnamed)'}`);
    }
    if (APPLY) await roadmaps.updateOne({ _id: doc._id }, { $set: { items: next } });
  }

  console.log('\n────────────────────────────────');
  if (unknown) {
    console.log(
      `${unknown} item(s) have no 'created' activity row — they predate the activity log and stay creatorless.`,
    );
  }
  if (!filled) {
    console.log('Nothing to recover — every item either has a creator or has no row to read one from.');
  } else if (APPLY) {
    console.log(`✅ Filled in ${filled} creator(s) across ${boards} roadmap(s).`);
  } else {
    console.log(`Would fill in ${filled} creator(s) across ${boards} roadmap(s).`);
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:roadmap-item-creator -- --apply');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

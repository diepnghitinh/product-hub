/**
 * One-time BACKFILL: relabel each user's pinned favourites whose `kind` is the old
 * per-kind value (`bug` / `task`) to the unified `issue`, snapshotting the original
 * kind into `issueKind` so the sidebar keeps routing (/bugs vs /tasks) and its icon.
 * Favourites are an embedded array on each user doc. Roadmap-item favourites
 * (`roadmap-item`) are left untouched. Pairs with the app now writing
 * `kind: 'issue'` + `issueKind` on all NEW issue favourites.
 *
 *   npm run backfill:favourite-kind              # DRY RUN — plan only
 *   npm run backfill:favourite-kind -- --apply   # relabel + set issueKind
 *
 * REQUIRED after the relabel: the sidebar/toggle now speak `kind='issue'`, so a
 * favourite still tagged `bug`/`task` won't match (it'd look unpinned + route
 * nowhere) until relabeled.
 * ORDER MATTERS: `issueKind` is written FIRST (from the original kind), then `kind`
 * is collapsed to `issue` — so no information is lost. REVERSIBLE: set
 * `kind = issueKind` and clear `issueKind`. Safe to re-run (idempotent): once no
 * favourite is tagged `bug`/`task`, every pass matches nothing. A prod run needs an
 * explicit MONGODB_URI (it won't silently hit localhost).
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

// A user carrying at least one favourite still on the old per-kind label.
const HAS_LEGACY_FAV = { 'favourites.kind': { $in: ['bug', 'task'] } };

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "🚚 APPLY — relabelling favourite kind 'bug'/'task' → 'issue' (+ issueKind)"
      : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const users = db.collection('users');

  // Count affected users + affected favourite elements (unwound) for the plan.
  const affectedUsers = await users.countDocuments(HAS_LEGACY_FAV);
  const [elemAgg] = await users
    .aggregate([
      { $unwind: '$favourites' },
      { $match: { 'favourites.kind': { $in: ['bug', 'task'] } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          bug: { $sum: { $cond: [{ $eq: ['$favourites.kind', 'bug'] }, 1, 0] } },
          task: { $sum: { $cond: [{ $eq: ['$favourites.kind', 'task'] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  const total = elemAgg?.total ?? 0;
  const bug = elemAgg?.bug ?? 0;
  const task = elemAgg?.task ?? 0;
  console.log(
    `\nFavourites to relabel: ${total} across ${affectedUsers} user(s) (bug:${bug}, task:${task})`,
  );

  if (!total) {
    console.log("Nothing to relabel — no favourite is tagged 'bug'/'task'.");
    await mongoose.disconnect();
    return;
  }

  if (APPLY) {
    // 1) Snapshot the original kind into issueKind — per element, matched by kind.
    const setBugKind = await users.updateMany(
      { 'favourites.kind': 'bug' },
      { $set: { 'favourites.$[b].issueKind': 'bug' } },
      { arrayFilters: [{ 'b.kind': 'bug' }] },
    );
    const setTaskKind = await users.updateMany(
      { 'favourites.kind': 'task' },
      { $set: { 'favourites.$[t].issueKind': 'task' } },
      { arrayFilters: [{ 't.kind': 'task' }] },
    );
    // 2) Only now collapse kind → 'issue' (issueKind already preserves the origin).
    const collapse = await users.updateMany(
      HAS_LEGACY_FAV,
      { $set: { 'favourites.$[e].kind': 'issue' } },
      { arrayFilters: [{ 'e.kind': { $in: ['bug', 'task'] } }] },
    );
    console.log(
      `\n✅ Set issueKind on ${setBugKind.modifiedCount + setTaskKind.modifiedCount} user doc(s) ` +
        `(bug:${setBugKind.modifiedCount}, task:${setTaskKind.modifiedCount}); ` +
        `collapsed kind→'issue' on ${collapse.modifiedCount} user doc(s).`,
    );
  } else {
    console.log(`\nWould relabel ${total} favourite(s) across ${affectedUsers} user(s).`);
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:favourite-kind -- --apply');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

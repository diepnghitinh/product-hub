/**
 * One-time BACKFILL: relabel existing reaction docs whose `targetType` is the old
 * per-kind value (`bug` / `task`) to the unified `issue`. Bugs and tasks are one
 * `issues` collection, and reactions key off the issue's shared id — so the old
 * bug/task split carried no information the id doesn't already. Pairs with the
 * app now writing `targetType: 'issue'` on all NEW reactions. Roadmap-item
 * reactions (`roadmap-item`) are left untouched.
 *
 *   npm run backfill:reaction-target-type              # DRY RUN — plan only
 *   npm run backfill:reaction-target-type -- --apply   # relabel bug/task → issue
 *
 * REQUIRED after the relabel: the app queries reactions with `targetType='issue'`,
 * so any doc still tagged `bug`/`task` would go invisible until relabeled.
 * REVERSIBLE in principle: a doc's original kind is recoverable by joining its
 * `targetId` back to the `issues` collection (`issue.kind`). Safe to re-run
 * (idempotent): a doc already tagged `issue`/`roadmap-item` is not matched. A prod
 * run needs an explicit MONGODB_URI (it won't silently hit localhost).
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

// A reaction still on the old per-kind label.
const NEEDS_RELABEL = { targetType: { $in: ['bug', 'task'] } };

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "🚚 APPLY — relabelling reaction targetType 'bug'/'task' → 'issue'"
      : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const reactions = db.collection('reactions');

  const pending = await reactions.countDocuments(NEEDS_RELABEL);
  const bugs = await reactions.countDocuments({ targetType: 'bug' });
  const tasks = await reactions.countDocuments({ targetType: 'task' });
  console.log(`\nReactions to relabel: ${pending} (bug:${bugs}, task:${tasks})`);

  if (!pending) {
    console.log("Nothing to relabel — no reaction is tagged 'bug'/'task'.");
    await mongoose.disconnect();
    return;
  }

  if (APPLY) {
    const res = await reactions.updateMany(NEEDS_RELABEL, { $set: { targetType: 'issue' } });
    console.log(`\n✅ Relabelled ${res.modifiedCount} reaction(s) to 'issue'.`);
  } else {
    console.log(`\nWould relabel ${pending} reaction(s) to 'issue'.`);
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:reaction-target-type -- --apply');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

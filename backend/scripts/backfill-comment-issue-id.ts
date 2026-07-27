/**
 * One-time BACKFILL: give every existing bug/task comment its canonical `issueId`
 * (= the legacy `bugId` or `taskId`, which are the issue's shared id). Pairs with
 * the create-time write that sets `issueId` on all NEW comments going forward
 * (issue-comment.use-cases.ts). Roadmap-item comments are left untouched.
 *
 *   npm run backfill:comment-issue-id              # DRY RUN — plan only, no changes
 *   npm run backfill:comment-issue-id -- --apply   # write issueId
 *
 * ADDITIVE + REVERSIBLE: it only ever SETS `issueId`; `bugId`/`taskId` keep their
 * values, so the change can be undone by clearing `issueId` again. Safe to re-run
 * (idempotent): a comment that already has a non-empty `issueId` is skipped. A prod
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

// A comment that needs backfilling: no issueId yet, but carries a legacy bug/task id.
const NEEDS_BACKFILL = {
  $and: [
    { $or: [{ issueId: '' }, { issueId: null }, { issueId: { $exists: false } }] },
    { $or: [{ bugId: { $nin: ['', null] } }, { taskId: { $nin: ['', null] } }] },
  ],
};

async function main(): Promise<void> {
  console.log(
    APPLY
      ? '🚚 APPLY — writing issueId = bugId || taskId on legacy comments'
      : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const comments = db.collection('comments');

  const pending = await comments.find(NEEDS_BACKFILL).toArray();
  const bugs = pending.filter((c) => c.bugId).length;
  const tasks = pending.length - bugs;
  console.log(`\nComments needing issueId: ${pending.length} (bug:${bugs}, task:${tasks})`);

  if (!pending.length) {
    console.log('Nothing to backfill — all comments already carry issueId.');
    await mongoose.disconnect();
    return;
  }

  if (APPLY) {
    // issueId = bugId when set, else taskId. Two targeted updates keep it simple
    // and index-friendly; each is idempotent (the filter excludes already-done docs).
    const bugRes = await comments.updateMany(
      { $and: [{ bugId: { $nin: ['', null] } }, { $or: [{ issueId: '' }, { issueId: null }, { issueId: { $exists: false } }] }] },
      [{ $set: { issueId: '$bugId' } }],
    );
    const taskRes = await comments.updateMany(
      { $and: [{ taskId: { $nin: ['', null] } }, { $or: [{ issueId: '' }, { issueId: null }, { issueId: { $exists: false } }] }] },
      [{ $set: { issueId: '$taskId' } }],
    );
    console.log(`\n✅ Backfilled issueId on ${bugRes.modifiedCount + taskRes.modifiedCount} comment(s) ` +
      `(bug:${bugRes.modifiedCount}, task:${taskRes.modifiedCount}).`);
  } else {
    console.log(`\nWould backfill issueId on ${pending.length} comment(s).`);
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:comment-issue-id -- --apply');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

/**
 * One-time BACKFILL: give every already-finished issue a `resolvedAt`.
 *
 * Going forward the entity stamps that field the moment an issue crosses into a
 * done status (IssueEntity.setStatus), but issues that were resolved *before* the
 * field existed carry nothing — so the boards' "Solved date" filter would read
 * them as never solved and hide them from every range.
 *
 *   npm run backfill:issue-resolved-at              # DRY RUN — plan only
 *   npm run backfill:issue-resolved-at -- --apply   # write the stamps
 *
 * The stamp used is the issue's own `updatedAt` — an APPROXIMATION, and the best
 * one available: the real transition wasn't recorded, and for a finished issue the
 * last write is usually the move that finished it. It is late (never early) when
 * the issue was edited afterwards. Nothing else reads it, so the cost of being off
 * is a bug landing in the wrong week of a solved-date filter, not wrong data
 * anywhere else. Rows fixed from here on are stamped exactly.
 *
 * Safe to re-run (idempotent): only issues that are in a done status AND have no
 * stamp are touched, so a second run is a no-op and an accurate stamp written by
 * the app is never overwritten. A prod run needs an explicit MONGODB_URI (it
 * won't silently hit localhost).
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

/** Mirrors COMPLETED_STATUS_KEYS (issue.enums.ts) — keep the two in step. */
const DONE_STATUS: Record<string, string[]> = {
  bug: ['resolved', 'closed'],
  task: ['done'],
};

/** No stamp yet: null (schema default) or the field absent on an older row. */
const UNSTAMPED = { $or: [{ resolvedAt: null }, { resolvedAt: { $exists: false } }] };

async function main(): Promise<void> {
  console.log(
    APPLY
      ? '🕒 APPLY — stamping resolvedAt on already-finished issues'
      : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');
  const issues = db.collection('issues');

  let total = 0;
  for (const [kind, statuses] of Object.entries(DONE_STATUS)) {
    const filter = { kind, status: { $in: statuses }, ...UNSTAMPED };
    const pending = await issues.find(filter).toArray();
    if (!pending.length) {
      console.log(`\n• ${kind} — nothing to stamp.`);
      continue;
    }

    // Per-status breakdown, so nothing is written silently.
    const byStatus: Record<string, number> = {};
    for (const i of pending) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    console.log(
      `\n• ${kind} — ${pending.length} finished issue(s) without a stamp [` +
        Object.entries(byStatus)
          .map(([s, n]) => `${s}:${n}`)
          .join(', ') +
        ']',
    );

    if (APPLY) {
      // One pipeline update rather than a write per issue: each row's stamp is
      // its own updatedAt (falling back to createdAt on the odd row that has no
      // updatedAt at all, so nothing is left unstamped).
      const res = await issues.updateMany(filter, [
        { $set: { resolvedAt: { $ifNull: ['$updatedAt', '$createdAt'] } } },
      ]);
      console.log(`    stamped ${res.modifiedCount}`);
      total += res.modifiedCount;
    } else {
      // Show a couple of examples so the approximation is visible before writing.
      for (const i of pending.slice(0, 3)) {
        console.log(
          `    ${i.shortId || i._id} · ${i.status} → ${new Date(i.updatedAt ?? i.createdAt).toISOString()}`,
        );
      }
      if (pending.length > 3) console.log(`    … and ${pending.length - 3} more`);
      total += pending.length;
    }
  }

  console.log('\n────────────────────────────────');
  console.log(
    APPLY ? `✅ Stamped ${total} issue(s).` : `Would stamp ${total} issue(s) from their updatedAt.`,
  );
  if (!APPLY) {
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:issue-resolved-at -- --apply');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

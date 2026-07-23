/**
 * One-time BACKFILL: put every no-cycle issue on a cycles-enabled team into that
 * team's CURRENT (active) cycle, so existing work shows under "Current" instead of
 * an invisible no-cycle backlog. Pairs with the create-time auto-add that keeps
 * NEW issues in the current cycle going forward (create-issue.use-case.ts).
 *
 *   npm run backfill:cycle-current              # DRY RUN — plan only, no changes
 *   npm run backfill:cycle-current -- --apply   # move the issues
 *
 * Safe to re-run (idempotent): once moved, an issue is no longer no-cycle, so a
 * second run is a no-op. Teams currently in cooldown (no active cycle) are skipped
 * — there is nowhere to move to; their issues stay in the backlog. A prod run
 * needs an explicit MONGODB_URI (it won't silently hit localhost).
 *
 * Does NOT touch carryOverCount — these issues are being *placed* into the current
 * cycle for the first time, not carried over, so they wear no "Carried over" badge.
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

const pad = (n: number): string => String(n).padStart(2, '0');
/** Today as YYYY-MM-DD in server-local time — matches the app's todayISO(). */
function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// An issue with no cycle: '' (schema default), or a legacy null / missing field.
const NO_CYCLE = { $or: [{ cycleId: '' }, { cycleId: null }, { cycleId: { $exists: false } }] };

async function main(): Promise<void> {
  const today = todayISO();
  console.log(
    APPLY
      ? "🚚 APPLY — moving no-cycle issues into each team's current cycle"
      : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`Today: ${today}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const teams = db.collection('teams');
  const cycles = db.collection('cycles');
  const issues = db.collection('issues');

  const cycleTeams = await teams.find({ cyclesEnabled: true }).toArray();
  if (!cycleTeams.length) {
    console.log('\nNo cycles-enabled teams — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  let totalMoved = 0;
  let totalSkipped = 0;

  for (const team of cycleTeams) {
    const teamId = String(team._id);
    const filter = { teamId, ...NO_CYCLE };
    const orphans = await issues.find(filter).toArray();
    if (!orphans.length) {
      console.log(`\n• ${team.name} — no no-cycle issues.`);
      continue;
    }

    // Status breakdown, so nothing moves silently (e.g. how many already-done).
    const byStatus: Record<string, number> = {};
    for (const i of orphans) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    const breakdown = Object.entries(byStatus)
      .map(([s, n]) => `${s}:${n}`)
      .join(', ');

    // The active cycle = the one whose window contains today (same rule as the
    // app's CycleEntity.statusOn). No such cycle ⇒ the team is in cooldown.
    const active = await cycles.findOne({
      teamId,
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    if (!active) {
      totalSkipped += orphans.length;
      console.log(
        `\n• ${team.name} — ${orphans.length} no-cycle issue(s) [${breakdown}] ` +
          `but NO active cycle right now (cooldown) → skipped.`,
      );
      continue;
    }

    console.log(
      `\n• ${team.name} — ${orphans.length} no-cycle issue(s) [${breakdown}] ` +
        `→ Cycle ${active.number} (${active.startDate} … ${active.endDate})`,
    );

    if (APPLY) {
      const res = await issues.updateMany(filter, { $set: { cycleId: String(active._id) } });
      console.log(`    moved ${res.modifiedCount}`);
      totalMoved += res.modifiedCount;
    } else {
      totalMoved += orphans.length;
    }
  }

  console.log('\n────────────────────────────────');
  console.log(
    APPLY
      ? `✅ Moved ${totalMoved} issue(s) into current cycles.${totalSkipped ? ` (${totalSkipped} skipped — team in cooldown.)` : ''}`
      : `Would move ${totalMoved} issue(s).${totalSkipped ? ` (${totalSkipped} skipped — team in cooldown.)` : ''}`,
  );
  if (!APPLY) {
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:cycle-current -- --apply');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

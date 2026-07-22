/**
 * GUARDED removal of the legacy `tasks`/`bugs` collections — the final, irreversible
 * step of the tasks+bugs → issues migration. Everything now reads/writes `issues`;
 * these two collections have only been kept as a frozen backup.
 *
 *   npm run migrate:issues:drop                              # DRY RUN — plan + safety gate, no changes
 *   npm run migrate:issues:drop -- --apply --yes             # DROP both collections (irreversible)
 *   npm run migrate:issues:drop -- --apply --yes --keep-backup   # RENAME to *_backup_<ts> (reversible) ★ safest
 *
 * Safety gates — all must hold before anything is removed:
 *   1. Runs a read-only coverage check first: every `tasks`/`bugs` `_id` must already
 *      exist in `issues`. If ANY old row is missing, it ABORTS regardless of flags —
 *      so you can never drop data that hasn't been carried over.
 *   2. Dry-run by default; a real run needs BOTH `--apply` and `--yes`.
 *   3. A prod run needs an explicit MONGODB_URI (won't silently hit localhost).
 *
 * ⚠️ Do NOT use `migrate:issues:reconcile` — since the app went issues-only, its
 * upsert would overwrite fresh data and its prune would delete post-cutover issues.
 * This script + `migrate:issues:audit` are the correct tools for the drop.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const YES = process.argv.includes('--yes');
const KEEP_BACKUP = process.argv.includes('--keep-backup');

const NODE_ENV = process.env['NODE_ENV'] || 'local';
const IS_PROD = NODE_ENV === 'prod' || NODE_ENV === 'production';
const DEFAULT_MONGODB_URI =
  'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

if (IS_PROD && !process.env.MONGODB_URI) {
  console.error(
    '✋ NODE_ENV=prod but MONGODB_URI is not set (would fall back to localhost).\n' +
      '   Set the production MONGODB_URI before dropping anything.',
  );
  process.exit(1);
}

const stamp = (): string =>
  new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // yyyymmddhhmmss

async function main(): Promise<void> {
  const mode = !APPLY
    ? '🔎 DRY RUN — no changes'
    : KEEP_BACKUP
      ? '📦 APPLY — RENAME old collections to *_backup_<ts> (reversible)'
      : '🗑️  APPLY — DROP old collections (IRREVERSIBLE)';
  console.log(mode);
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const tasks = db.collection('tasks');
  const bugs = db.collection('bugs');
  const issues = db.collection('issues');

  const [taskIds, bugIds, issueIds] = await Promise.all([
    tasks.distinct('_id'),
    bugs.distinct('_id'),
    issues.distinct('_id'),
  ]);
  const issueSet = new Set<string>(issueIds.map(String));
  const missingTasks = taskIds.map(String).filter((id) => !issueSet.has(id));
  const missingBugs = bugIds.map(String).filter((id) => !issueSet.has(id));

  console.log('\n────────────────────────────────');
  console.log(`tasks:  ${taskIds.length}`);
  console.log(`bugs:   ${bugIds.length}`);
  console.log(`issues: ${issueIds.length}`);
  console.log('────────────────────────────────');

  // GATE 1 — coverage. Never remove old rows that aren't already in `issues`.
  if (missingTasks.length || missingBugs.length) {
    console.error(
      `\n❌ ABORT — coverage check FAILED. ${missingTasks.length} task(s) + ` +
        `${missingBugs.length} bug(s) are NOT present in \`issues\`.\n` +
        `   Dropping now would lose them. Investigate first (sample: ` +
        `${[...missingTasks, ...missingBugs].slice(0, 10).join(', ')}).`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('✅ Coverage OK — every old task/bug row is present in `issues`.');

  if (!APPLY) {
    console.log(
      `\nDry run only — nothing changed. To remove the old collections:\n` +
        `  • reversible (recommended): npm run migrate:issues:drop -- --apply --yes --keep-backup\n` +
        `  • hard drop (irreversible): npm run migrate:issues:drop -- --apply --yes`,
    );
    await mongoose.disconnect();
    return;
  }

  // GATE 2 — explicit double confirmation for any real change.
  if (!YES) {
    console.error(
      '\n✋ Refusing to modify collections without confirmation. Re-run with `--apply --yes`.',
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  for (const [name, col] of [['tasks', tasks], ['bugs', bugs]] as const) {
    try {
      if (KEEP_BACKUP) {
        const target = `${name}_backup_${stamp()}`;
        await col.rename(target);
        console.log(`📦 renamed \`${name}\` → \`${target}\``);
      } else {
        await col.drop();
        console.log(`🗑️  dropped \`${name}\``);
      }
    } catch (e) {
      console.log(`   (skipped \`${name}\`: ${(e as Error).message})`);
    }
  }

  const remaining = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log(`\n\`issues\` still holds ${await issues.countDocuments()} doc(s).`);
  console.log(`Collections now: ${remaining.join(', ')}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

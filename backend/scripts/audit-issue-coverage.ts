/**
 * READ-ONLY pre-drop safety audit for the tasks+bugs → issues migration.
 *
 *    npm run migrate:issues:audit
 *
 * The question before dropping the old `tasks`/`bugs` collections is simply:
 * **is every old row already represented in `issues`?** If yes, the drop loses
 * nothing. This checks exactly that — in the tasks/bugs → issues direction — and
 * writes NOTHING.
 *
 * NOTE: this is the correct gate now, NOT `migrate:issues:reconcile`. Since Phase 4
 * the app writes only to `issues` and the old collections are frozen, so `issues`
 * is the AUTHORITATIVE SUPERSET: it contains every old row PLUS every row created
 * after the cutover (which has no twin in the frozen old collections). The reconcile
 * (`--apply --prune`) assumes the opposite (old = superset): it would overwrite fresh
 * post-cutover edits with stale frozen data and DELETE every post-cutover issue as an
 * "orphan". Do not run it. Use this audit to gate the drop instead.
 */
import mongoose from 'mongoose';

const NODE_ENV = process.env['NODE_ENV'] || 'local';
const DEFAULT_MONGODB_URI =
  'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

async function main(): Promise<void> {
  console.log('🔎 READ-ONLY audit — issue coverage of the old tasks/bugs collections (no writes)');
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
  const oldSet = new Set<string>([...taskIds, ...bugIds].map(String));

  const missingTasks = taskIds.map(String).filter((id) => !issueSet.has(id));
  const missingBugs = bugIds.map(String).filter((id) => !issueSet.has(id));
  const issuesWithoutTwin = issueIds.map(String).filter((id) => !oldSet.has(id));

  console.log('\n────────────────────────────────');
  console.log(`tasks:  ${taskIds.length}`);
  console.log(`bugs:   ${bugIds.length}`);
  console.log(`issues: ${issueIds.length}`);
  console.log('────────────────────────────────');
  console.log(`Old rows MISSING from issues (must be 0 to drop safely):`);
  console.log(`  • tasks not in issues: ${missingTasks.length}`);
  console.log(`  • bugs  not in issues: ${missingBugs.length}`);
  console.log(
    `Issues with NO old-collection twin (post-cutover rows that ONLY exist in issues —\n` +
      `  these are authoritative and are exactly what a prune would WRONGLY delete): ${issuesWithoutTwin.length}`,
  );

  const safe = missingTasks.length === 0 && missingBugs.length === 0;
  console.log('\n' + (safe
    ? '✅ SAFE TO DROP: every old task/bug row is present in `issues`. Dropping the old\n' +
      '   collections loses nothing.'
    : '❌ NOT SAFE: some old rows are absent from `issues` (listed below) — investigate\n' +
      '   before dropping. Sample: ' + [...missingTasks, ...missingBugs].slice(0, 10).join(', ')));

  await mongoose.disconnect();
  process.exit(safe ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n❌ Audit failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

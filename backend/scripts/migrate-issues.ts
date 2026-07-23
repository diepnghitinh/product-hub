/**
 * One-off data migration — consolidate the separate `bugs` and `tasks`
 * collections into a single unified `issues` collection.
 *
 * The frontend already treats bugs and tasks as one "issue" concept
 * (IssueBoardLayout / IssueDetail); this backfills a matching `issues`
 * collection so a future unified Issue module has data to read. NOTE: nothing
 * reads `issues` yet — this is a preparation step, not a behaviour change.
 *
 * SAFE BY DESIGN:
 *  - Non-destructive: only ever READS `bugs`/`tasks`; never drops or edits them.
 *  - Idempotent: every issue keeps its source `_id` and is upserted, so a re-run
 *    replaces in place instead of duplicating (and existing IssueLink refs,
 *    which point at bug/task ids, stay valid).
 *  - Dry-run by default: prints what it *would* do and writes nothing. Pass
 *    `--apply` to actually write.
 *
 *    npm run migrate:issues          # dry run — safe preview, no writes
 *    npm run migrate:issues:apply    # writes into the `issues` collection
 *
 * Index creation is intentionally left to the future Issue Mongoose model (the
 * one place the app declares its indexes, as bugs/tasks do today) so the two
 * can't drift. Connects with MONGODB_URI (same default as the app).
 */
// Load the per-environment config from /config so MONGODB_URI is read from
// config/.env.<env> (same loader the app uses), not just the hardcoded default.
import '@shared/utils/dotenv';
import mongoose from 'mongoose';
import type { Collection } from 'mongodb'; // what connection.db.collection() returns

// The old `tasks`/`bugs` collections are frozen legacy data this script reads raw
// (via db.collection), so their doc shapes are inlined here rather than imported —
// the infrastructure task/bug slices that defined them were removed once every
// live reader had moved to `issues`. Kept loose (like IssueDoc below) on purpose.
interface TaskDoc {
  _id: string;
  tenantId: string;
  teamId: string;
  ownerId: string;
  parentId: string;
  shortId: string;
  title: string;
  description: string;
  status: string;
  roadmapId: string;
  roadmapItemId: string;
  roadmapItemLabel: string;
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  estimate: number;
  labelKeys: string[];
  customFields: Record<string, unknown>;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BugDoc {
  _id: string;
  tenantId: string;
  teamId: string;
  shortId: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  type: string;
  projectId: string;
  caseId: string;
  caseLabel: string;
  reportId: string;
  assigneeId: string;
  assigneeName: string;
  reporterId: string;
  reporterName: string;
  startDate: string;
  endDate: string;
  order: number;
  attachments: unknown[];
  labelKeys: string[];
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const NODE_ENV = process.env['NODE_ENV'] || 'local';
const IS_PROD = NODE_ENV === 'prod' || NODE_ENV === 'production';

const DEFAULT_MONGODB_URI =
  'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

// Safety net for the `:prod` scripts: a prod run MUST use an explicit prod
// MONGODB_URI (loaded from config/.env.prod). If it isn't set we'd silently fall
// back to the localhost default and "migrate prod" against the wrong database —
// so refuse loudly instead.
if (IS_PROD && !process.env.MONGODB_URI) {
  console.error(
    '✋ NODE_ENV=prod but MONGODB_URI is not set (would fall back to localhost).\n' +
      '   Create backend/config/.env.prod with the production MONGODB_URI, then re-run.',
  );
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
// Reconcile mode: after upserting, also DELETE issue twins whose source task/bug
// no longer exists (rows deleted during the window before live dual-write existed).
// Off by default — the plain backfill only ever adds — because a prune is the one
// part of this script that removes from `issues`.
const PRUNE = process.argv.includes('--prune');
const BATCH = 500;

type IssueKind = 'bug' | 'task';

/**
 * The unified issue document — the flat union of Task + Bug fields with a `kind`
 * discriminator. Fields that don't apply to a kind carry a neutral default that
 * mirrors that field's own default in its source schema.
 */
type IssueDoc = {
  _id: string;
  kind: IssueKind;
  tenantId: string;
  teamId: string;
  ownerId: string; // task-only (personal board); '' for bugs
  parentId: string; // task-only (sub-tasks); '' for bugs
  shortId: string;
  title: string;
  description: string;
  status: string;
  // routing / linkage
  roadmapId: string; // task-only
  roadmapItemId: string; // task-only
  roadmapItemLabel: string; // task-only
  projectId: string;
  // people
  assigneeId: string;
  assigneeName: string;
  createdBy: string; // for a bug, seeded from its reporter (see bugToIssue)
  createdByName: string;
  reporterId: string; // bug-only
  reporterName: string; // bug-only
  // dates / sizing
  startDate: string;
  endDate: string;
  dueDate: string; // task-only
  estimate: number; // task-only
  // bug-only specifics
  severity: string;
  type: string;
  caseId: string;
  caseLabel: string;
  reportId: string;
  attachments: unknown[];
  // shared meta
  labelKeys: string[];
  customFields: Record<string, unknown>;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

function taskToIssue(t: TaskDoc): IssueDoc {
  return {
    _id: t._id,
    kind: 'task',
    tenantId: t.tenantId,
    teamId: t.teamId ?? '',
    ownerId: t.ownerId ?? '',
    parentId: t.parentId ?? '',
    shortId: t.shortId ?? '',
    title: t.title,
    description: t.description ?? '',
    status: t.status ?? 'todo',
    roadmapId: t.roadmapId ?? '',
    roadmapItemId: t.roadmapItemId ?? '',
    roadmapItemLabel: t.roadmapItemLabel ?? '',
    projectId: t.projectId ?? '',
    assigneeId: t.assigneeId ?? '',
    assigneeName: t.assigneeName ?? '',
    createdBy: t.createdBy ?? '',
    createdByName: t.createdByName ?? '',
    reporterId: '',
    reporterName: '',
    startDate: t.startDate ?? '',
    endDate: t.endDate ?? '',
    dueDate: t.dueDate ?? '',
    estimate: t.estimate ?? 0,
    severity: '',
    type: '',
    caseId: '',
    caseLabel: '',
    reportId: '',
    attachments: [],
    labelKeys: t.labelKeys ?? [],
    customFields: t.customFields ?? {},
    order: t.order ?? 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function bugToIssue(b: BugDoc): IssueDoc {
  return {
    _id: b._id,
    kind: 'bug',
    tenantId: b.tenantId,
    teamId: b.teamId ?? '',
    ownerId: '', // bugs are never personal
    parentId: '', // bugs have no sub-hierarchy
    shortId: b.shortId ?? '',
    title: b.title,
    description: b.description ?? '',
    status: b.status ?? 'open',
    roadmapId: '',
    roadmapItemId: '',
    roadmapItemLabel: '',
    projectId: b.projectId ?? '',
    assigneeId: b.assigneeId ?? '',
    assigneeName: b.assigneeName ?? '',
    // A bug's reporter is effectively its creator — seed the unified `createdBy`
    // from it so "who opened this" is populated, while keeping reporter* intact.
    createdBy: b.reporterId ?? '',
    createdByName: b.reporterName ?? '',
    reporterId: b.reporterId ?? '',
    reporterName: b.reporterName ?? '',
    startDate: b.startDate ?? '',
    endDate: b.endDate ?? '',
    dueDate: '',
    estimate: 0,
    severity: b.severity ?? 'medium',
    type: b.type ?? '',
    caseId: b.caseId ?? '',
    caseLabel: b.caseLabel ?? '',
    reportId: b.reportId ?? '',
    attachments: b.attachments ?? [],
    labelKeys: b.labelKeys ?? [],
    customFields: b.customFields ?? {},
    order: b.order ?? 0,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** Upsert a batch of issues by `_id` (idempotent replace). */
async function upsertBatch(
  issues: Collection<IssueDoc>,
  docs: IssueDoc[],
): Promise<{ upserted: number; modified: number }> {
  if (!docs.length) return { upserted: 0, modified: 0 };
  const ops = docs.map((d) => {
    // Carry the source `_id` on the filter so a re-run replaces in place; the
    // replacement itself must be id-less per the driver's ReplaceOne contract.
    const { _id, ...rest } = d;
    return { replaceOne: { filter: { _id }, replacement: rest, upsert: true } };
  });
  const res = await issues.bulkWrite(ops, { ordered: false });
  return { upserted: res.upsertedCount ?? 0, modified: res.modifiedCount ?? 0 };
}

/**
 * Delete issue twins orphaned by a source delete — `issues` rows whose `_id` is
 * no longer present in either `tasks` or `bugs`. Live dual-write removes a twin as
 * its source is deleted, so this only catches deletes from *before* dual-write
 * shipped; it makes `issues` an exact mirror so reads can safely move onto it.
 */
async function pruneOrphans(
  tasks: Collection,
  bugs: Collection,
  issues: Collection<IssueDoc>,
): Promise<number> {
  // Every id that still has a live source. `distinct('_id')` is fine at this
  // scale (one-off op); the Set makes the membership test O(1) per issue.
  const [taskIds, bugIds] = await Promise.all([
    tasks.distinct('_id'),
    bugs.distinct('_id'),
  ]);
  const live = new Set<string>([...taskIds, ...bugIds].map(String));

  const orphans: string[] = [];
  const cursor = issues.find({}, { projection: { _id: 1 } });
  for await (const doc of cursor) {
    if (!live.has(String(doc._id))) orphans.push(doc._id);
  }

  console.log(`\nPRUNE: ${orphans.length} orphan twin(s) (source deleted)`);
  if (!orphans.length) return 0;

  if (APPLY) {
    for (let i = 0; i < orphans.length; i += BATCH) {
      await issues.deleteMany({ _id: { $in: orphans.slice(i, i + BATCH) } });
    }
    console.log(`  → deleted ${orphans.length}`);
  } else {
    console.log(`  → would delete ${orphans.length} (dry run)`);
  }
  return orphans.length;
}

/** Stream one source collection through its transform into `issues`. */
async function migrateKind(
  source: Collection,
  issues: Collection<IssueDoc>,
  kind: IssueKind,
  transform: (raw: any) => IssueDoc,
): Promise<{ processed: number; upserted: number; modified: number }> {
  const total = await source.countDocuments();
  console.log(`\n${kind.toUpperCase()}S: found ${total}`);

  let processed = 0;
  let upserted = 0;
  let modified = 0;
  let buffer: IssueDoc[] = [];

  const flush = async () => {
    if (APPLY) {
      const r = await upsertBatch(issues, buffer);
      upserted += r.upserted;
      modified += r.modified;
    }
    processed += buffer.length;
    buffer = [];
  };

  const cursor = source.find({});
  for await (const raw of cursor) {
    buffer.push(transform(raw));
    if (buffer.length >= BATCH) await flush();
  }
  if (buffer.length) await flush();

  console.log(
    APPLY
      ? `  → upserted ${upserted} new, replaced ${modified} existing (${processed} ${kind}s)`
      : `  → would migrate ${processed} ${kind}(s)`,
  );
  return { processed, upserted, modified };
}

async function main(): Promise<void> {
  console.log(
    APPLY
      ? `⚙️  APPLY — writing into the \`issues\` collection${PRUNE ? ' (+ prune orphans)' : ''}`
      : `🔎 DRY RUN — no writes (pass --apply to migrate)${PRUNE ? ' [prune preview]' : ''}`,
  );
  // Show which environment/database we're about to touch (mask credentials).
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const tasks = db.collection('tasks');
  const bugs = db.collection('bugs');
  const issues = db.collection<IssueDoc>('issues');

  const existing = await issues.countDocuments();
  if (existing) {
    console.log(
      `\nNote: \`issues\` already has ${existing} doc(s) — matching ids are replaced, not duplicated.`,
    );
  }

  const t = await migrateKind(tasks, issues, 'task', taskToIssue);
  const b = await migrateKind(bugs, issues, 'bug', bugToIssue);
  const pruned = PRUNE ? await pruneOrphans(tasks, bugs, issues) : 0;

  console.log('\n────────────────────────────────');
  console.log(`Tasks:  ${t.processed}`);
  console.log(`Bugs:   ${b.processed}`);
  console.log(
    `Total:  ${t.processed + b.processed} issue(s) ${APPLY ? 'written' : 'to migrate'}`,
  );
  if (PRUNE) console.log(`Pruned: ${pruned} orphan twin(s) ${APPLY ? 'deleted' : 'to delete'}`);
  if (APPLY) {
    console.log(`\`issues\` now holds ${await issues.countDocuments()} doc(s).`);
  } else {
    console.log('\nRe-run with `npm run migrate:issues:apply` to write.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Migration failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

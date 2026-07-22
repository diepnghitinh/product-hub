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
import mongoose from 'mongoose';
import type { Collection } from 'mongodb'; // what connection.db.collection() returns
import type { TaskDoc } from '../src/infrastructure/tasks/entities/task.schema';
import type { BugDoc } from '../src/infrastructure/bugs/entities/bug.schema';

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin';

const APPLY = process.argv.includes('--apply');
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
      ? '⚙️  APPLY — writing into the `issues` collection'
      : '🔎 DRY RUN — no writes (pass --apply to migrate)',
  );
  // Mask credentials in the printed URI.
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

  console.log('\n────────────────────────────────');
  console.log(`Tasks:  ${t.processed}`);
  console.log(`Bugs:   ${b.processed}`);
  console.log(
    `Total:  ${t.processed + b.processed} issue(s) ${APPLY ? 'written' : 'to migrate'}`,
  );
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

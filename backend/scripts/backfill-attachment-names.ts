/**
 * One-time BACKFILL: repair attachment filenames that were stored as mojibake.
 *
 * Until 2026-08-05 the upload endpoint let multer decode multipart part headers
 * as latin1 (busboy's default), so a file called `Báo cáo tháng 7.xlsx` was
 * stored under the name `BÃ¡o cÃ¡o thÃ¡ng 7.xlsx`. New uploads are fixed at the
 * source (`defParamCharset: 'utf8'`); this repairs the names already on record.
 *
 *   npm run backfill:attachment-names              # DRY RUN — plan only
 *   npm run backfill:attachment-names -- --apply   # rewrite the names
 *
 * Only the display `name` changes. The `url` is untouched — storage keys were
 * always ASCII-flattened, so no stored file moves and no link breaks.
 *
 * Safe to re-run (idempotent): `decodeMultipartFilename` only rewrites a name
 * whose bytes are unambiguously latin1-decoded UTF-8, so an already-correct
 * name is left exactly as it is and a second run finds nothing to do.
 * A prod run needs an explicit MONGODB_URI (it won't silently hit localhost).
 */
import mongoose from 'mongoose';
import { decodeMultipartFilename } from '../src/application/storage/domain/filename';

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

interface Attachment {
  name?: unknown;
  [k: string]: unknown;
}

/** Repair one list; returns the new list and how many names changed. */
function repairList(list: unknown): { list: Attachment[]; changed: string[][] } {
  const changed: string[][] = [];
  if (!Array.isArray(list)) return { list: [], changed };
  const next = (list as Attachment[]).map((file) => {
    if (!file || typeof file !== 'object' || typeof file.name !== 'string') return file;
    const fixed = decodeMultipartFilename(file.name);
    if (fixed === file.name) return file;
    changed.push([file.name, fixed]);
    return { ...file, name: fixed };
  });
  return { list: next, changed };
}

async function main(): Promise<void> {
  console.log(
    APPLY ? '🔤 APPLY — repairing attachment names' : '🔎 DRY RUN — plan only, no changes',
  );
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  let names = 0;
  let records = 0;

  // Doc pages and issues both hold a flat `attachments` array.
  for (const name of ['docpages', 'issues'] as const) {
    const col = db.collection(name);
    const rows = await col.find({ 'attachments.0': { $exists: true } }).toArray();
    for (const row of rows) {
      const { list, changed } = repairList(row.attachments);
      if (!changed.length) continue;
      records++;
      names += changed.length;
      console.log(`\n• ${name} ${String(row.ref ?? row._id)}`);
      for (const [was, now] of changed) console.log(`    ${was}\n      → ${now}`);
      if (APPLY) await col.updateOne({ _id: row._id }, { $set: { attachments: list } });
    }
  }

  // Roadmap items are a `Mixed` array on the roadmap itself.
  const roadmaps = db.collection('roadmaps');
  for (const row of await roadmaps.find({ 'items.0': { $exists: true } }).toArray()) {
    const items = row.items as Array<Record<string, unknown>>;
    let hit = 0;
    const nextItems = items.map((item) => {
      if (!Array.isArray(item?.attachments)) return item;
      const { list, changed } = repairList(item.attachments);
      if (!changed.length) return item;
      hit += changed.length;
      console.log(`\n• roadmap item ${String(item.ref ?? item.id ?? '')}`);
      for (const [was, now] of changed) console.log(`    ${was}\n      → ${now}`);
      return { ...item, attachments: list };
    });
    if (!hit) continue;
    records++;
    names += hit;
    if (APPLY) await roadmaps.updateOne({ _id: row._id }, { $set: { items: nextItems } });
  }

  console.log('\n────────────────────────────────');
  if (!names) {
    console.log('✅ Every attachment name is already correct — nothing to do.');
  } else if (APPLY) {
    console.log(`✅ Repaired ${names} filename(s) across ${records} record(s). No URLs changed.`);
  } else {
    console.log(`Would repair ${names} filename(s) across ${records} record(s).`);
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run backfill:attachment-names -- --apply');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

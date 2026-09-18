/**
 * AUDIT (and optionally fix) the bucket settings a direct browser upload needs.
 *
 * Uploads go browser → bucket, so two things live on the bucket rather than in
 * this repo, and both fail quietly:
 *   1. CORS allowing `PUT` **and** exposing the `ETag` header. Miss the PUT and
 *      nothing uploads; miss the ETag and every part of a large file uploads and
 *      the file can never be joined. Either way the app falls back to the slow
 *      through-the-API path and nobody is told.
 *   2. An `AbortIncompleteMultipartUpload` lifecycle rule, so parts from an upload
 *      that was abandoned (closed laptop) stop being billed. Nice-to-have, not
 *      load-bearing — AWS needs it; MinIO sweeps stale uploads itself.
 *
 * The app already sets both on its first upload, best-effort, and logs a warning
 * when the key can't (`s3:PutBucketCors` / `s3:PutLifecycleConfiguration`). This
 * script is how you see that state on purpose instead of reading logs.
 *
 *   npm run storage:cors                                  # DRY RUN — report only
 *   npm run storage:cors -- --apply                       # add the missing rules
 *   npm run storage:cors -- --apply --origin=https://app.example.com
 *
 * `--origin` narrows `AllowedOrigins` to your app (repeatable, comma-separated).
 * Left off, it uses `*`, which is what the app itself writes: the *signature* is
 * the authorization here — anyone holding a signed URL could already `curl` it
 * from anywhere — and what the rule actually unlocks is the browser's preflight.
 *
 * Safe to re-run: it only ever ADDS a rule, never replaces the bucket's existing
 * ones, and does nothing at all to a bucket that already passes. Read-only without
 * `--apply`. A prod run needs an explicit MONGODB_URI (it won't silently hit
 * localhost).
 */
import {
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
  type CORSRule,
  type LifecycleRule,
} from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import { StorageProvider } from '@application/app-settings/domain/storage.types';
import {
  ABANDONED_PARTS_RULE,
  BROWSER_UPLOAD_CORS,
  allowsBrowserUpload,
} from '@infrastructure/storage/storage.service';
import type { CloudStorageConfig } from '@application/app-settings/domain/storage.types';

const APPLY = process.argv.includes('--apply');

/** `--origin=a,b --origin=c` → `['a','b','c']`; none → the app's own `*`. */
const ORIGINS = process.argv
  .filter((a) => a.startsWith('--origin='))
  .flatMap((a) => a.slice('--origin='.length).split(','))
  .map((o) => o.trim())
  .filter(Boolean);

const NODE_ENV = process.env['NODE_ENV'] || 'local';
const IS_PROD = NODE_ENV === 'prod' || NODE_ENV === 'production';
const DEFAULT_MONGODB_URI =
  'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

if (IS_PROD && !process.env.MONGODB_URI) {
  console.error(
    '✋ NODE_ENV=prod but MONGODB_URI is not set (would fall back to localhost).\n' +
      '   Set the production MONGODB_URI before touching any bucket.',
  );
  process.exit(1);
}

const corsRule: CORSRule = ORIGINS.length
  ? { ...BROWSER_UPLOAD_CORS, AllowedOrigins: ORIGINS }
  : BROWSER_UPLOAD_CORS;

interface TenantStorage {
  tenantId: string;
  storage: CloudStorageConfig;
}

function clientFor(config: CloudStorageConfig): S3Client {
  return new S3Client({
    region: config.s3Region || 'us-east-1',
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint, forcePathStyle: true } : {}),
    credentials:
      config.s3AccessKeyId && config.s3SecretAccessKey
        ? {
            accessKeyId: config.s3AccessKeyId,
            secretAccessKey: config.s3SecretAccessKey,
          }
        : undefined,
  });
}

/** A bucket with no CORS configured answers with an error, not an empty list. */
async function readCors(client: S3Client, bucket: string): Promise<CORSRule[]> {
  try {
    const res = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    return res.CORSRules ?? [];
  } catch {
    return [];
  }
}

async function readLifecycle(client: S3Client, bucket: string): Promise<LifecycleRule[]> {
  try {
    const res = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
    return res.Rules ?? [];
  } catch {
    return [];
  }
}

function describeRule(rule: CORSRule): string {
  const methods = (rule.AllowedMethods ?? []).join(',') || '—';
  const origins = (rule.AllowedOrigins ?? []).join(',') || '—';
  const exposed = (rule.ExposeHeaders ?? []).join(',') || '—';
  return `methods=[${methods}] origins=[${origins}] expose=[${exposed}]`;
}

async function auditTenant(tenant: TenantStorage): Promise<boolean> {
  const { tenantId, storage } = tenant;
  const bucket = storage.s3Bucket as string;
  const where = storage.s3Endpoint || storage.s3Region || 'aws';
  console.log(`\n── tenant ${tenantId} — bucket "${bucket}" @ ${where}`);

  const client = clientFor(storage);
  let cors: CORSRule[];
  try {
    cors = await readCors(client, bucket);
  } catch (err) {
    console.log(`   ❌ could not reach the bucket: ${(err as Error).message}`);
    return false;
  }

  const good = cors.find(allowsBrowserUpload);
  for (const rule of cors) {
    console.log(`   · ${rule === good ? '✅' : '  '} ${describeRule(rule)}`);
  }
  if (!cors.length) console.log('   · (no CORS rules at all)');

  const lifecycle = await readLifecycle(client, bucket);
  const sweeps = lifecycle.some((r) => r.AbortIncompleteMultipartUpload);

  if (good && sweeps) {
    console.log('   ✅ direct upload OK, abandoned parts swept.');
    return true;
  }

  if (!good) {
    const putOnly = cors.some((r) => r.AllowedMethods?.includes('PUT'));
    console.log(
      putOnly
        ? '   ⚠️  PUT is allowed but no rule exposes ETag — large files upload and can never be joined.'
        : '   ⚠️  nothing allows a browser PUT — every upload falls back to the slow path through the API.',
    );
  }
  if (!sweeps) {
    console.log('   ⚠️  no AbortIncompleteMultipartUpload rule — abandoned parts are billed forever.');
  }

  if (!APPLY) {
    console.log('   → would add: ' + (good ? '' : `CORS ${describeRule(corsRule)}; `) +
      (sweeps ? '' : `lifecycle ${ABANDONED_PARTS_RULE.ID}`));
    return false;
  }

  // Additive, never a replacement — the bucket may be shared with something else.
  if (!good) {
    try {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: { CORSRules: [...cors, corsRule] },
        }),
      );
      console.log('   ✅ CORS rule added.');
    } catch (err) {
      console.log(
        `   ❌ could not write CORS: ${(err as Error).message}\n` +
          '      The key needs s3:PutBucketCors, or set the rule by hand in the bucket settings.',
      );
      return false;
    }
  }
  if (!sweeps) {
    try {
      await client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucket,
          LifecycleConfiguration: { Rules: [...lifecycle, ABANDONED_PARTS_RULE] },
        }),
      );
      console.log('   ✅ lifecycle rule added.');
    } catch (err) {
      console.log(
        `   ⚠️  could not write the lifecycle rule: ${(err as Error).message}\n` +
          '      Harmless on MinIO (it sweeps stale uploads itself); on AWS the key needs ' +
          's3:PutLifecycleConfiguration.',
      );
    }
  }
  return true;
}

async function main(): Promise<void> {
  console.log(
    APPLY
      ? '🚚 APPLY — adding the browser-upload CORS + abandoned-parts rules where missing'
      : '🔎 DRY RUN — report only, no bucket is touched',
  );
  console.log(`Env:    ${NODE_ENV}`);
  console.log(`Mongo:  ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`Origin: ${ORIGINS.length ? ORIGINS.join(', ') : '* (any — the signature is the authorization)'}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  // Mongoose derives this from the model name ('AppSettings'). Resolve it rather
  // than assume: guessing wrong would find no workspace and print a clean bill of
  // health, which is the one wrong answer this script must never give.
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  const collection =
    names.find((n) => n === 'appsettings') ??
    names.find((n) => n.toLowerCase().replace(/[-_]/g, '').startsWith('appsetting'));
  if (!collection) {
    throw new Error(
      `No app-settings collection in this database (saw: ${names.join(', ') || 'none'}). ` +
        'Wrong MONGODB_URI?',
    );
  }

  const tenants = (await db
    .collection(collection)
    .find({ 'storage.provider': StorageProvider.S3 })
    .project({ tenantId: 1, storage: 1 })
    .toArray()) as unknown as TenantStorage[];

  const configured = tenants.filter((t) => t.storage?.s3Bucket);
  console.log(`\nWorkspaces on S3: ${configured.length}`);
  if (tenants.length !== configured.length) {
    console.log(`(${tenants.length - configured.length} on S3 with no bucket named — skipped)`);
  }
  if (!configured.length) {
    console.log('Nothing to check — no workspace has an S3 bucket configured.');
    await mongoose.disconnect();
    return;
  }

  let ok = 0;
  for (const tenant of configured) {
    if (await auditTenant(tenant)) ok += 1;
  }

  console.log(`\n${ok}/${configured.length} bucket(s) ready for direct browser uploads.`);
  if (!APPLY && ok < configured.length) {
    console.log('\nDry run only — nothing changed. To apply:');
    console.log('  npm run storage:cors -- --apply --origin=https://your-app-origin');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

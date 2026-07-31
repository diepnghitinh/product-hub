/**
 * Seeds the platform console: the first operator account, and a starter plan
 * catalog (Free · Pro · Business) if none exists yet.
 *
 *   npm run seed:platform                                  # defaults, dev only
 *   npm run seed:platform -- --email you@co --password '…' # explicit
 *
 * There is deliberately no sign-up endpoint for platform operators — the vendor
 * console is not something anyone should be able to create an account on. This
 * script is the only way the first one comes into existence, which is why it
 * refuses to invent a password in production.
 *
 * Idempotent: an existing operator with the same email has their password reset
 * (that's the recovery path); existing plans are left exactly as they are.
 */
import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const NODE_ENV = process.env['NODE_ENV'] || 'local';
const IS_PROD = NODE_ENV === 'prod' || NODE_ENV === 'production';
const DEFAULT_MONGODB_URI =
  'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

const EMAIL = (arg('email') || process.env.PLATFORM_ADMIN_EMAIL || 'ops@product-hub.io')
  .trim()
  .toLowerCase();
const NAME = arg('name') || process.env.PLATFORM_ADMIN_NAME || 'Platform Owner';
const PASSWORD = arg('password') || process.env.PLATFORM_ADMIN_PASSWORD || '';

if (IS_PROD && !process.env.MONGODB_URI) {
  console.error('✋ NODE_ENV=prod but MONGODB_URI is not set (would hit localhost).');
  process.exit(1);
}
if (IS_PROD && !PASSWORD) {
  console.error(
    '✋ Refusing to seed a production operator without an explicit password.\n' +
      '   Pass --password "…" or set PLATFORM_ADMIN_PASSWORD.',
  );
  process.exit(1);
}

const password = PASSWORD || 'platform123';

/** A catalog worth looking at on first run — edit it in the console afterwards. */
const STARTER_PLANS = [
  {
    code: 'free',
    name: 'Free',
    description: 'For trying product-hub out',
    priceMonthly: 0,
    priceYearly: 0,
    sortOrder: 0,
    extendsCode: null,
    features: {
      users: { limit: 5 },
      projects: { limit: 2 },
      issues: { limit: 200 },
      docs: { limit: 20 },
      teams: { limit: 2 },
      roadmaps: { limit: 1 },
      cycles: { enabled: false },
      okrs: { enabled: false },
      public_sharing: { enabled: true },
      collab_editing: { enabled: false },
      api_keys: { enabled: false },
      mcp: { enabled: false },
      audit_log: { enabled: false },
      custom_storage: { enabled: false },
      webhooks: { enabled: false },
      priority_support: { enabled: false },
    },
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'For growing product teams',
    priceMonthly: 49,
    priceYearly: 490,
    sortOrder: 1,
    // Sparse on purpose: Pro states only what it changes about Free.
    extendsCode: 'free',
    features: {
      users: { limit: 25 },
      projects: { limit: 20 },
      issues: { limit: 5000 },
      docs: { limit: 500 },
      teams: { limit: 10 },
      roadmaps: { limit: 5 },
      cycles: { enabled: true },
      okrs: { enabled: true },
      collab_editing: { enabled: true },
      api_keys: { enabled: true },
      mcp: { enabled: true },
    },
  },
  {
    code: 'business',
    name: 'Business',
    description: 'Unlimited, with audit and priority support',
    priceMonthly: 149,
    priceYearly: 1490,
    sortOrder: 2,
    extendsCode: 'pro',
    features: {
      users: { limit: -1 },
      projects: { limit: -1 },
      issues: { limit: -1 },
      docs: { limit: -1 },
      teams: { limit: -1 },
      roadmaps: { limit: -1 },
      audit_log: { enabled: true },
      custom_storage: { enabled: true },
      webhooks: { enabled: true },
      priority_support: { enabled: true },
    },
  },
];

async function main(): Promise<void> {
  console.log(`Env:   ${NODE_ENV}`);
  console.log(`Mongo: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const now = new Date();
  const admins = db.collection('platformadmins');
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await admins.findOne({ email: EMAIL });

  if (existing) {
    await admins.updateOne(
      { _id: existing._id },
      { $set: { passwordHash, name: NAME, isActive: true, updatedAt: now } },
    );
    console.log(`\n🔑 Reset the password for existing operator ${EMAIL}`);
  } else {
    await admins.insertOne({
      _id: uuid() as unknown as never,
      email: EMAIL,
      name: NAME,
      passwordHash,
      isActive: true,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`\n👤 Created platform operator ${EMAIL}`);
  }

  const plans = db.collection('plans');
  let created = 0;
  for (const plan of STARTER_PLANS) {
    if (await plans.findOne({ code: plan.code })) continue;
    await plans.insertOne({
      _id: uuid() as unknown as never,
      ...plan,
      currency: 'USD',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }
  console.log(
    created > 0
      ? `📦 Seeded ${created} plan(s): ${STARTER_PLANS.map((p) => p.code).join(', ')}`
      : '📦 Plans already exist — left untouched.',
  );

  console.log('\n────────────────────────────────');
  console.log('Sign in to the console with:');
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD ? '(the one you passed)' : password}`);
  if (!PASSWORD) console.log('\n⚠️  Default password — change it after first login.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

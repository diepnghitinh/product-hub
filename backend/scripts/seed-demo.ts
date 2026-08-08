/**
 * Seeds a **demo workspace** you can log into and click around:
 *
 *   six people, one per role · three teams with their own columns and labels ·
 *   38 issues across tasks, bugs and sub-tasks, spread over people, statuses and
 *   dates · a cycle mid-flight with a goal · a backlog of 12 bets under 3 epics,
 *   scored and tied to OKRs · 3 test features with 15 cases, 3 of them failing ·
 *   a handbook · and a private board only the admin can see.
 *
 *   ./dev.sh                       # the API has to be up — see below
 *   npm run seed:demo              # create it
 *   npm run seed:demo -- --reset   # delete the old one first, then create
 *
 * **It drives the HTTP API, not the database.** Almost every field worth having
 * in a demo is *derived*: short ids (`TSK-6HCUHKX`), roadmap item refs, column
 * ordering, `resolvedAt`, cycle membership, the legacy `dueDate` mirror. Hand-
 * writing Mongo documents means hand-writing all of that too, and the first one
 * that drifts from the schema shows up as a subtly broken screen rather than an
 * error. Going through the API means the app computes them, exactly as it would
 * for a real user.
 *
 * The one thing that can't go through the API is **deletion** — there is no
 * delete-tenant endpoint, and there shouldn't be — so `--reset` talks to Mongo
 * directly. That asymmetry is deliberate, not an oversight.
 *
 * Local only. It refuses to run against a non-localhost API unless you pass
 * `--force`, because it creates accounts with a published password.
 */
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const API = (arg('api') || process.env.SEED_API || 'http://localhost:3000/v1').replace(/\/$/, '');
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin';
const PASSWORD = arg('password') || 'demo1234';
const WORKSPACE = arg('workspace') || 'Northwind Product';
const DOMAIN = arg('domain') || 'demo.local';

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(API) && !flag('force')) {
  console.error(
    `✋ ${API} is not localhost, and this seeds accounts whose password is printed on screen.\n` +
      '   Pass --force if you really mean it.',
  );
  process.exit(1);
}

// ── People ────────────────────────────────────────────────────────────────────
// One of each role, because the roles are what the permission gates key off:
// a demo with four admins never shows you the screens a developer can't reach.
const PEOPLE = [
  { key: 'ada', name: 'Ada Nguyen', role: 'admin', local: 'ada' },
  { key: 'minh', name: 'Minh Tran', role: 'product', local: 'minh' },
  { key: 'linh', name: 'Linh Pham', role: 'developer', local: 'linh' },
  { key: 'khoa', name: 'Khoa Le', role: 'developer', local: 'khoa' },
  { key: 'thu', name: 'Thu Vo', role: 'tester', local: 'thu' },
  { key: 'son', name: 'Son Dang', role: 'tester', local: 'son' },
] as const;

type PersonKey = (typeof PEOPLE)[number]['key'];
const email = (local: string) => `${local}@${DOMAIN}`;

// ── Dates, relative to the run ────────────────────────────────────────────────
// A demo seeded with fixed dates is stale the week after it's written: "due
// 3 months ago" on every card. Everything below is expressed in days from today.
const TODAY = new Date();
const day = (offset: number): string => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

// ── Talking to the API ────────────────────────────────────────────────────────
let token = '';

async function call<T = any>(method: string, path: string, body?: unknown, as = token): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(as ? { Authorization: `Bearer ${as}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    const detail = json?.message ?? json;
    throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(detail)}`);
  }
  // The API wraps every payload in { statusCode, data }.
  return (json?.data ?? json) as T;
}

const get = <T = any>(p: string) => call<T>('GET', p);
const post = <T = any>(p: string, b?: unknown, as?: string) => call<T>('POST', p, b ?? {}, as);
const patch = <T = any>(p: string, b: unknown) => call<T>('PATCH', p, b);
const put = <T = any>(p: string, b: unknown) => call<T>('PUT', p, b);

/**
 * Sign in as a teammate, so a comment can be *theirs*.
 *
 * The author is taken from the caller's token, never from the payload — which is
 * right, but it means a seed holding only the admin's token produces a thread
 * where six people say things and all six are Ada. That reads as broken.
 */
const tokens: Record<string, string> = {};
async function tokenFor(key: PersonKey): Promise<string> {
  if (!tokens[key]) {
    const person = PEOPLE.find((p) => p.key === key)!;
    const res = await call<any>(
      'POST',
      '/auth/login',
      { email: email(person.local), password: PASSWORD },
      '',
    );
    tokens[key] = res.token;
  }
  return tokens[key];
}

/** The API is up? Said early and plainly, because "fetch failed" isn't a diagnosis. */
async function requireApi(): Promise<void> {
  try {
    await fetch(`${API.replace(/\/v1$/, '')}/v1/health`);
  } catch {
    console.error(
      `✋ Nothing answering at ${API}.\n` +
        '   Start the stack first: ./dev.sh   (or pass --api http://localhost:PORT/v1)',
    );
    process.exit(1);
  }
}

/** Delete the demo tenant — the one thing with no endpoint behind it. */
async function reset(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');
  const owner = await db.collection('users').findOne({ email: email(PEOPLE[0].local) });
  if (!owner) {
    console.log('↺ Nothing to reset — no existing demo workspace.');
  } else {
    const tenantId = owner.tenantId as string;
    let total = 0;
    for (const { name } of await db.listCollections().toArray()) {
      const { deletedCount } = await db.collection(name).deleteMany({ tenantId });
      total += deletedCount;
    }
    const t = await db
      .collection('tenants')
      .deleteMany({ $or: [{ id: tenantId }, { _id: tenantId as never }] });
    console.log(
      `↺ Reset: removed ${total + t.deletedCount} documents from the old demo workspace.`,
    );
  }
  await mongoose.disconnect();
}

// ── The workspace ─────────────────────────────────────────────────────────────

interface Team {
  id: string;
  key: string;
  name: string;
  issueType: string;
  statuses: { key: string; label: string; color: string }[];
}

/**
 * Columns worth looking at. Registration gives every team the built-in three
 * (or five, for a bug team); a real board has the one extra column that says how
 * the team actually works, so the demo has it too.
 */
const ENG_STATUSES = [
  { key: 'todo', label: 'Backlog', color: 'hsl(220 9% 46%)' },
  { key: 'in-progress', label: 'In progress', color: 'hsl(248 53% 58%)' },
  { key: 'in-review', label: 'In review', color: 'hsl(38 92% 50%)' },
  { key: 'done', label: 'Done', color: 'hsl(142 55% 40%)' },
];
const QC_STATUSES = [
  { key: 'open', label: 'Open', color: 'hsl(0 72% 51%)' },
  { key: 'in-progress', label: 'Investigating', color: 'hsl(248 53% 58%)' },
  { key: 'blocked', label: 'Blocked', color: 'hsl(38 92% 50%)' },
  { key: 'resolved', label: 'Fixed', color: 'hsl(142 55% 40%)' },
  { key: 'closed', label: 'Closed', color: 'hsl(220 9% 46%)' },
];
const DESIGN_STATUSES = [
  { key: 'todo', label: 'Requested', color: 'hsl(220 9% 46%)' },
  { key: 'in-progress', label: 'Designing', color: 'hsl(280 60% 55%)' },
  { key: 'in-review', label: 'Feedback', color: 'hsl(38 92% 50%)' },
  { key: 'done', label: 'Shipped', color: 'hsl(142 55% 40%)' },
];

const ENG_LABELS = [
  { key: 'api', name: 'API', color: 'hsl(248 53% 58%)' },
  { key: 'mobile', name: 'Mobile', color: 'hsl(199 89% 48%)' },
  { key: 'infra', name: 'Infra', color: 'hsl(220 9% 46%)' },
  { key: 'tech-debt', name: 'Tech debt', color: 'hsl(38 92% 50%)' },
];
const QC_LABELS = [
  { key: 'regression', name: 'Regression', color: 'hsl(0 72% 51%)' },
  { key: 'ux', name: 'UX', color: 'hsl(280 60% 55%)' },
  { key: 'data', name: 'Data', color: 'hsl(142 55% 40%)' },
];

/** One issue to create, in the shape the seed talks about it. */
interface Seeded {
  title: string;
  status: string;
  assignee?: PersonKey;
  description?: string;
  start?: number;
  end?: number;
  estimate?: number;
  severity?: string;
  type?: string;
  /** Who filed it. Defaults to the assignee, then to the admin. */
  reporter?: PersonKey;
  /** Sub-tasks, created against this issue as parent. */
  subtasks?: { title: string; status: string; assignee?: PersonKey }[];
  /** Comments to leave on it, in order. */
  comments?: { by: PersonKey; body: string }[];
}

const ENG_ISSUES: Seeded[] = [
  {
    title: 'Passkey sign-in for the mobile app',
    status: 'in-progress',
    assignee: 'linh',
    estimate: 8,
    start: -6,
    end: 5,
    description:
      '<p>Replace the SMS one-time code with a platform passkey. SMS costs us ~$1.8k/month and is the top driver of sign-in drop-off on Android.</p>' +
      '<h3>Acceptance</h3><ul><li>Face ID / fingerprint enrolment on first sign-in</li><li>SMS stays as the fallback for one release</li><li>Enrolment rate visible in the funnel dashboard</li></ul>',
    subtasks: [
      { title: 'WebAuthn ceremony on the auth endpoint', status: 'done', assignee: 'linh' },
      { title: 'iOS enrolment screen', status: 'in-progress', assignee: 'khoa' },
      { title: 'Android enrolment screen', status: 'todo', assignee: 'khoa' },
      { title: 'Fallback path when the device has no biometrics', status: 'todo' },
    ],
    comments: [
      {
        by: 'minh',
        body: 'Enrolment has to be skippable — forcing it on first launch will cost us more than SMS does.',
      },
      {
        by: 'linh',
        body: 'Agreed, it is a prompt not a wall. iOS is behind a flag on staging now.',
      },
    ],
  },
  {
    title: 'Transaction list is slow past 500 rows',
    status: 'in-progress',
    assignee: 'khoa',
    estimate: 5,
    start: -3,
    end: 4,
    description:
      '<p>The list renders every row in the account history. Accounts with a few years of activity take 2–4s to become interactive on a mid-range Android.</p><p>Virtualise the list and page the query.</p>',
    comments: [
      {
        by: 'khoa',
        body: 'Profiled it — 80% of the time is layout, not the fetch. Virtualising first.',
      },
      {
        by: 'thu',
        body: 'Worth checking the pull-to-refresh while you are in there, it re-renders the whole list.',
      },
    ],
  },
  {
    title: 'Move the nightly export off the app server',
    status: 'todo',
    assignee: 'linh',
    estimate: 13,
    start: 3,
    end: 17,
    description:
      '<p>The 02:00 export pins a core for 40 minutes and is why the p99 looks like it does overnight.</p>',
  },
  {
    title: 'Rate-limit the password reset endpoint',
    status: 'in-review',
    assignee: 'khoa',
    estimate: 3,
    end: 2,
  },
  { title: 'Upgrade to Node 22 LTS', status: 'todo', estimate: 5, start: 10, end: 24 },
  // Ada's, and deliberately late: the home screen counts overdue work, and a
  // demo whose Overdue tile reads 0 never shows you that the tile exists.
  {
    title: 'Agree the v1 deprecation window with support',
    status: 'in-progress',
    assignee: 'ada',
    estimate: 2,
    start: -8,
    end: -2,
  },
  {
    title: 'Retire the v1 accounts endpoint',
    status: 'todo',
    assignee: 'ada',
    estimate: 8,
    start: 2,
    end: 16,
  },
  {
    title: 'Statement PDFs render the wrong currency symbol',
    status: 'done',
    assignee: 'linh',
    estimate: 2,
    start: -18,
    end: -12,
  },
  {
    title: 'Add structured logging to the payments worker',
    status: 'done',
    assignee: 'khoa',
    estimate: 3,
    start: -20,
    end: -15,
  },
  {
    title: 'Cache the FX rate lookup',
    status: 'done',
    assignee: 'linh',
    estimate: 2,
    start: -25,
    end: -21,
  },
  {
    title: 'Split the monolith’s notification module',
    status: 'todo',
    estimate: 21,
    description:
      '<p>Not this quarter — filed so it stops being re-discovered in every planning session.</p>',
  },
  {
    title: 'Idempotency keys on the transfer API',
    status: 'in-review',
    assignee: 'linh',
    estimate: 5,
    end: 1,
  },
  { title: 'Prune the staging database weekly', status: 'todo', assignee: 'khoa', estimate: 1 },
  {
    title: 'Instrument the sign-in funnel',
    status: 'in-progress',
    assignee: 'khoa',
    estimate: 3,
    start: -2,
    end: 6,
  },
  { title: 'Document the deploy runbook', status: 'todo', assignee: 'ada', estimate: 2, end: 0 },
  {
    title: 'Replace the deprecated crypto calls',
    status: 'done',
    assignee: 'khoa',
    estimate: 2,
    start: -30,
    end: -26,
  },
];

const QC_ISSUES: Seeded[] = [
  {
    title: 'Transfer confirmation shows the sender’s balance, not the recipient’s',
    status: 'open',
    // Found by a tester, assigned to the developer fixing it — the split the
    // reporter field exists for.
    reporter: 'thu',
    assignee: 'linh',
    severity: 'critical',
    type: 'Data',
    start: -1,
    end: 2,
    description:
      '<h3>Steps</h3><ol><li>Sign in as a user with two accounts</li><li>Transfer 100 from Current to Savings</li><li>Read the confirmation screen</li></ol>' +
      '<h3>Expected</h3><p>Savings balance after the transfer.</p><h3>Actual</h3><p>Current balance after the transfer, labelled as Savings.</p>',
    comments: [
      {
        by: 'thu',
        body: 'Reproduces on iOS 18.2 and on the web. Not a rendering issue — the payload is wrong.',
      },
      {
        by: 'linh',
        body: 'Confirmed, the mapper reads the source account twice. Fix is small, adding a test first.',
      },
    ],
  },
  {
    title: 'Session expires mid-form and loses everything typed',
    status: 'in-progress',
    reporter: 'son',
    assignee: 'khoa',
    severity: 'high',
    type: 'UX',
    start: -4,
    end: 3,
    comments: [
      {
        by: 'son',
        body: 'Thirty minutes idle and the transfer form is gone. Two of the five people in last week’s sessions hit this.',
      },
      {
        by: 'minh',
        body: 'Draft-save the form is the real fix; extending the session just moves the cliff.',
      },
    ],
  },
  {
    title: 'Card freeze toggle reverts after a background/foreground cycle',
    status: 'open',
    assignee: 'thu',
    severity: 'high',
    type: 'Mobile',
  },
  {
    title: 'Search ignores diacritics for Vietnamese names',
    status: 'open',
    assignee: 'son',
    severity: 'medium',
    type: 'Search',
  },
  {
    title: 'Empty state shows a spinner forever with no network',
    status: 'blocked',
    assignee: 'thu',
    severity: 'medium',
    type: 'UX',
  },
  {
    title: 'Amount field accepts more than two decimal places',
    status: 'resolved',
    assignee: 'son',
    severity: 'low',
    type: 'Validation',
    start: -9,
    end: -5,
  },
  {
    title: 'Statement download filename is untitled.pdf on Safari',
    status: 'resolved',
    assignee: 'thu',
    severity: 'low',
    type: 'UI',
    start: -14,
    end: -10,
  },
  {
    title: 'Push notification deep-links to the wrong account',
    status: 'in-progress',
    reporter: 'son',
    assignee: 'linh',
    severity: 'high',
    type: 'Mobile',
    start: -2,
    end: 4,
  },
  {
    title: 'Dark mode: disabled buttons are unreadable',
    status: 'open',
    assignee: 'thu',
    severity: 'low',
    type: 'UI',
  },
  {
    title: 'Duplicate transfer when the confirm button is double-tapped',
    status: 'open',
    assignee: 'son',
    severity: 'critical',
    type: 'Data',
    end: 1,
  },
  {
    title: 'Onboarding tooltip traps VoiceOver focus',
    status: 'open',
    assignee: 'thu',
    severity: 'medium',
    type: 'Accessibility',
  },
  {
    title: 'Currency rounding differs between the list and the detail',
    status: 'closed',
    assignee: 'son',
    severity: 'medium',
    type: 'Data',
    start: -35,
    end: -30,
  },
];

const DESIGN_ISSUES: Seeded[] = [
  {
    title: 'Sign-in screen: passkey variant',
    status: 'in-progress',
    assignee: 'minh',
    estimate: 5,
    start: -5,
    end: 3,
  },
  {
    title: 'Empty states for the transaction list',
    status: 'in-review',
    assignee: 'minh',
    estimate: 3,
    end: 2,
  },
  { title: 'Card freeze: confirmation pattern', status: 'todo', estimate: 2 },
  {
    title: 'Sign off the passkey enrolment copy',
    status: 'in-review',
    assignee: 'ada',
    estimate: 1,
    end: 2,
  },
  {
    title: 'Accessibility pass on the colour tokens',
    status: 'todo',
    assignee: 'minh',
    estimate: 8,
    start: 7,
    end: 21,
  },
  {
    title: 'Statement PDF layout',
    status: 'done',
    assignee: 'minh',
    estimate: 3,
    start: -22,
    end: -16,
  },
];

/** The admin's own private board — nobody else can see these. */
const PERSONAL: { title: string; status: string; end?: number }[] = [
  { title: 'Write the Q3 narrative for the board deck', status: 'in-progress', end: 4 },
  { title: 'Read the churn interviews from last month', status: 'todo' },
  { title: 'Book the offsite venue', status: 'todo', end: 9 },
  { title: 'Renew the Figma seats', status: 'done' },
];

const EPICS = [
  {
    id: 'epic-signin',
    label: 'Sign-in overhaul',
    color: 'hsl(248 53% 58%)',
    description: 'Get people into the app without an SMS code.',
  },
  {
    id: 'epic-money',
    label: 'Moving money',
    color: 'hsl(142 55% 40%)',
    description: 'Transfers people trust on the first try.',
  },
  {
    id: 'epic-trust',
    label: 'Trust & control',
    color: 'hsl(38 92% 50%)',
    description: 'Freeze, limits, and knowing what happened.',
  },
];

/**
 * RICE here is **1–5 on all four axes**, not the textbook version.
 *
 * The field help says so ("rate 1 (few) to 5 (many)") and new items default to
 * 3/3/3/3. Seeding classic RICE — reach as a headcount, confidence as a
 * percentage — produces scores in the tens of thousands sitting next to a form
 * that says 1 to 5, which makes the whole screen look broken.
 */
const BACKLOG = [
  {
    title: 'Passkey sign-in',
    phase: 'now',
    epicId: 'epic-signin',
    status: 'in-progress',
    difficulty: 'hard',
    reach: 5,
    impact: 4,
    confidence: 4,
    effort: 4,
    progress: 45,
    start: -6,
    end: 20,
    description:
      '<p>SMS is our biggest sign-in drop-off and a real line on the bill. Passkeys remove both.</p>',
  },
  {
    title: 'Remember this device',
    phase: 'next',
    epicId: 'epic-signin',
    status: 'planned',
    difficulty: 'medium',
    reach: 4,
    impact: 2,
    confidence: 4,
    effort: 2,
    progress: 0,
    start: 21,
    end: 45,
  },
  {
    title: 'Sign in with a work account (SSO)',
    phase: 'later',
    epicId: 'epic-signin',
    status: 'idea',
    difficulty: 'hard',
    reach: 1,
    impact: 2,
    confidence: 2,
    effort: 5,
    progress: 0,
  },
  {
    title: 'Scheduled transfers',
    phase: 'now',
    epicId: 'epic-money',
    status: 'in-progress',
    difficulty: 'medium',
    reach: 4,
    impact: 3,
    confidence: 4,
    effort: 3,
    progress: 30,
    start: -2,
    end: 25,
  },
  {
    title: 'Split a payment between accounts',
    phase: 'next',
    epicId: 'epic-money',
    status: 'planned',
    difficulty: 'medium',
    reach: 2,
    impact: 2,
    confidence: 3,
    effort: 3,
    progress: 0,
    start: 26,
    end: 55,
  },
  {
    title: 'Request money from a contact',
    phase: 'later',
    epicId: 'epic-money',
    status: 'idea',
    difficulty: 'hard',
    reach: 3,
    impact: 4,
    confidence: 2,
    effort: 5,
    progress: 0,
  },
  {
    title: 'Freeze a card instantly',
    phase: 'now',
    epicId: 'epic-trust',
    status: 'in-progress',
    difficulty: 'easy',
    reach: 4,
    impact: 5,
    confidence: 5,
    effort: 2,
    progress: 70,
    start: -10,
    end: 8,
  },
  {
    title: 'Spending limits per card',
    phase: 'next',
    epicId: 'epic-trust',
    status: 'planned',
    difficulty: 'medium',
    reach: 3,
    impact: 3,
    confidence: 3,
    effort: 3,
    progress: 0,
    start: 15,
    end: 50,
  },
  {
    title: 'Merchant names people recognise',
    phase: 'next',
    epicId: 'epic-trust',
    status: 'planned',
    difficulty: 'hard',
    reach: 5,
    impact: 3,
    confidence: 3,
    effort: 4,
    progress: 10,
  },
  {
    title: 'Statement export to CSV',
    phase: 'later',
    epicId: '',
    status: 'idea',
    difficulty: 'easy',
    reach: 1,
    impact: 1,
    confidence: 4,
    effort: 1,
    progress: 0,
  },
  {
    title: 'In-app dispute flow',
    phase: 'later',
    epicId: 'epic-trust',
    status: 'idea',
    difficulty: 'hard',
    reach: 2,
    impact: 4,
    confidence: 2,
    effort: 5,
    progress: 0,
  },
  {
    title: 'Dark mode',
    phase: 'done',
    epicId: '',
    status: 'done',
    difficulty: 'medium',
    reach: 4,
    impact: 1,
    confidence: 5,
    effort: 3,
    progress: 100,
    start: -60,
    end: -20,
  },
];

/**
 * The quarter's OKRs. Key result ids are fixed strings so the roadmap can point
 * at them below — the link is denormalized (the item stores the id *and* a
 * label), which is why the label is written once here and reused verbatim.
 */
const OBJECTIVES = [
  {
    id: 'obj-signin',
    title: 'Getting in is no longer the hard part',
    status: 'on-track',
    notes: 'Sign-in is the first thing every user does and our worst-performing step.',
    keyResults: [
      {
        id: 'kr-signin-1',
        title: 'Sign-in completion above 92%',
        progress: 61,
        owner: 'Minh Tran',
        status: 'on-track',
      },
      {
        id: 'kr-signin-2',
        title: 'SMS spend down 60%',
        progress: 25,
        owner: 'Ada Nguyen',
        status: 'at-risk',
      },
    ],
  },
  {
    id: 'obj-trust',
    title: 'People feel in control of their money',
    status: 'on-track',
    notes: '',
    keyResults: [
      {
        id: 'kr-trust-1',
        title: 'Card freeze used by 15% of active cards',
        progress: 40,
        owner: 'Minh Tran',
        status: 'on-track',
      },
      {
        id: 'kr-trust-2',
        title: 'Support tickets about unknown charges down 30%',
        progress: 15,
        owner: 'Ada Nguyen',
        status: '',
      },
    ],
  },
];

/**
 * Test features and their cases — the `/testing/:projectId` side of the app,
 * which is what a project's card actually counts (reports done / testing / info,
 * not issues).
 *
 * Cases are written as `[area, type, result, steps…, expected]` so the table
 * fills out rather than showing a column of blanks, and the results are mixed on
 * purpose: an all-Passed suite hides the failure styling and the coverage bar.
 */
const FEATURES: {
  title: string;
  label: string;
  status: string;
  featureId: string;
  module: string;
  subtitle: string;
  owner: PersonKey;
  reported: number;
  banner: { title: string; description: string };
  overview: string[];
  /**
   * Coverage is a **Yes/No checklist**, not a percentage — the editor reads
   * `percent >= 100` as Yes and anything else as No. Seeding 80 would render as
   * a red "No", which says the opposite of what 80 means.
   */
  coverage: { label: string; percent: number }[];
  cases: {
    area: string;
    type: string;
    result: string;
    owner: PersonKey;
    precondition?: string;
    steps: string[];
    expected: string;
    actual?: string;
    note?: string;
  }[];
}[] = [
  {
    title: 'Passkey enrolment',
    label: 'Sign-in',
    status: 'testing',
    featureId: 'F-101',
    module: 'Auth',
    subtitle: 'Face ID / fingerprint enrolment, with SMS as the fallback',
    owner: 'thu',
    reported: -2,
    banner: {
      title: 'Two blockers before this can ship',
      description:
        'The Android no-biometrics path fails outright, and the replay test is waiting on the security harness.',
    },
    overview: [
      'Covers first-time passkey enrolment on iOS and Android, plus the SMS fallback for devices with no biometrics.',
      'Run against staging build 2026.8.3 with the passkey flag on.',
    ],
    coverage: [
      { label: 'iOS', percent: 100 },
      { label: 'Android', percent: 0 },
      { label: 'Fallback path', percent: 0 },
    ],
    cases: [
      {
        area: 'Enrolment',
        type: 'Functional',
        result: 'Passed',
        owner: 'thu',
        precondition: 'A device with Face ID enrolled, signed out.',
        steps: [
          'Open the app',
          'Sign in with email and the one-time code',
          'Accept the passkey prompt',
        ],
        expected: 'A passkey is stored and the next sign-in offers it first.',
      },
      {
        area: 'Enrolment',
        type: 'UX',
        result: 'Passed',
        owner: 'thu',
        steps: ['Reach the passkey prompt', 'Tap "Not now"'],
        expected: 'Sign-in continues, and the prompt returns on a later session — never a wall.',
      },
      {
        area: 'Enrolment',
        type: 'Functional',
        result: 'Failed',
        owner: 'son',
        precondition: 'An Android device with no biometrics enrolled.',
        steps: ['Sign in with email and the one-time code'],
        expected: 'The passkey step is skipped silently and SMS is used.',
        actual: 'The prompt shows, then errors with "Something went wrong" and blocks sign-in.',
        note: 'Raised as a bug — this is the fallback path in the sub-task.',
      },
      {
        area: 'Sign-in',
        type: 'Functional',
        result: 'Passed',
        owner: 'thu',
        steps: ['Sign in on a device that already has a passkey'],
        expected: 'Biometric prompt, no code, straight into the app.',
      },
      {
        area: 'Sign-in',
        type: 'Security',
        result: 'Blocked',
        owner: 'son',
        steps: ['Attempt to reuse a captured assertion'],
        expected: 'The server rejects a replayed assertion.',
        note: 'Blocked — needs the security team’s test harness, booked for next week.',
      },
      {
        area: 'Sign-in',
        type: 'Accessibility',
        result: 'Retest',
        owner: 'thu',
        steps: ['Navigate the enrolment screen with VoiceOver'],
        expected: 'Every control is reachable and announced.',
        actual: 'The tooltip trapped focus. Fixed in build 2026.8.3, not yet re-run.',
      },
      {
        area: 'Recovery',
        type: 'Functional',
        result: 'Untested',
        owner: 'son',
        steps: ['Remove the passkey from the device', 'Sign in'],
        expected: 'Falls back to SMS and offers re-enrolment.',
      },
    ],
  },
  {
    title: 'Card freeze',
    label: 'Trust',
    status: 'done',
    featureId: 'F-088',
    module: 'Cards',
    subtitle: 'Freeze and unfreeze from the card detail screen',
    owner: 'thu',
    reported: -21,
    banner: {
      title: 'Signed off',
      description: 'All cases pass on both platforms. Shipped in 2026.7.',
    },
    overview: ['Freeze and unfreeze a card from the card detail screen. Shipped in 2026.7.'],
    coverage: [
      { label: 'iOS', percent: 100 },
      { label: 'Android', percent: 100 },
    ],
    cases: [
      {
        area: 'Freeze',
        type: 'Functional',
        result: 'Passed',
        owner: 'thu',
        steps: ['Open a card', 'Toggle Freeze', 'Confirm'],
        expected: 'The card shows as frozen and a payment attempt is declined.',
      },
      {
        area: 'Freeze',
        type: 'Integration',
        result: 'Passed',
        owner: 'son',
        steps: ['Freeze a card', 'Attempt a card-present payment'],
        expected: 'The processor declines with the frozen-card code.',
      },
      {
        area: 'Unfreeze',
        type: 'Functional',
        result: 'Passed',
        owner: 'thu',
        steps: ['Unfreeze the card', 'Retry the payment'],
        expected: 'The payment goes through within a few seconds.',
      },
      {
        area: 'Freeze',
        type: 'Regression',
        result: 'Passed',
        owner: 'son',
        steps: ['Freeze', 'Background the app for a minute', 'Reopen'],
        expected: 'Still frozen — the toggle does not revert.',
        note: 'Guards the bug we found in July.',
      },
    ],
  },
  {
    title: 'Transfer limits and validation',
    label: 'Payments',
    status: 'testing',
    featureId: 'F-114',
    module: 'Payments',
    subtitle: 'Amount validation, daily limits, and the confirmation screen',
    owner: 'son',
    reported: -5,
    banner: {
      title: 'Confirmation screen is wrong',
      description:
        'It shows the sender’s balance labelled as the recipient’s. Critical, fix in progress.',
    },
    overview: ['Amount validation, daily limits, and the confirmation screen.'],
    coverage: [
      { label: 'Validation', percent: 100 },
      { label: 'Daily limits', percent: 0 },
    ],
    cases: [
      {
        area: 'Validation',
        type: 'Functional',
        result: 'Failed',
        owner: 'son',
        steps: ['Enter 10.999 in the amount field', 'Continue'],
        expected: 'The field refuses more than two decimal places.',
        actual: 'Accepted, and the confirmation rounds it silently.',
      },
      {
        area: 'Confirmation',
        type: 'Functional',
        result: 'Failed',
        owner: 'thu',
        steps: ['Transfer between two of your own accounts', 'Read the confirmation'],
        expected: 'The recipient balance after the transfer.',
        actual: 'The sender balance, labelled as the recipient.',
        note: 'The critical bug on the QC board.',
      },
      {
        area: 'Limits',
        type: 'Functional',
        result: 'Passed',
        owner: 'son',
        steps: ['Transfer above the daily limit'],
        expected: 'Refused, with the remaining allowance named.',
      },
      {
        area: 'Confirmation',
        type: 'UI',
        result: 'Skipped',
        owner: 'thu',
        steps: ['Check the confirmation in dark mode'],
        expected: 'Readable contrast throughout.',
        note: 'Skipped this round — dark mode is covered by its own suite.',
      },
    ],
  },
];

/** Which roadmap bet serves which key result. Anything unlisted has no OKR. */
const ITEM_OKR: Record<string, { objectiveId: string; keyResultId: string; label: string }> = {
  'Passkey sign-in': {
    objectiveId: 'obj-signin',
    keyResultId: 'kr-signin-1',
    label: 'Sign-in completion above 92%',
  },
  'Remember this device': {
    objectiveId: 'obj-signin',
    keyResultId: 'kr-signin-2',
    label: 'SMS spend down 60%',
  },
  'Freeze a card instantly': {
    objectiveId: 'obj-trust',
    keyResultId: 'kr-trust-1',
    label: 'Card freeze used by 15% of active cards',
  },
  'Merchant names people recognise': {
    objectiveId: 'obj-trust',
    keyResultId: 'kr-trust-2',
    label: 'Support tickets about unknown charges down 30%',
  },
};

async function main(): Promise<void> {
  console.log(`API:       ${API}`);
  console.log(`Workspace: ${WORKSPACE}`);

  await requireApi();
  if (flag('reset')) await reset();

  // ── The workspace and its owner ─────────────────────────────────────────────
  const owner = PEOPLE[0];
  let me: any;
  try {
    me = await post('/auth/register', {
      tenantName: WORKSPACE,
      name: owner.name,
      email: email(owner.local),
      password: PASSWORD,
    });
  } catch (err) {
    console.error(
      `\n✋ Could not create ${email(owner.local)} — it probably already exists.\n` +
        '   Re-run with --reset to replace the demo workspace, or --domain something-else.\n' +
        `   (${(err as Error).message})`,
    );
    process.exit(1);
  }
  token = me.token;
  console.log(`\n👤 ${owner.name} — ${email(owner.local)} (admin)`);

  // ── The rest of the team ────────────────────────────────────────────────────
  const users: Record<string, string> = { [owner.key]: me.user.id };
  for (const p of PEOPLE.slice(1)) {
    const u = await post('/users', {
      name: p.name,
      email: email(p.local),
      password: PASSWORD,
      role: p.role,
    });
    users[p.key] = u.id;
    console.log(`👤 ${p.name} — ${email(p.local)} (${p.role})`);
  }
  const who = (k?: PersonKey) => (k ? [users[k]] : undefined);

  // ── Teams ───────────────────────────────────────────────────────────────────
  // Registration already made QC and Engineering; the demo dresses them and adds
  // a third so the sidebar isn't the default two.
  const existing = await get<{ data?: Team[] } | Team[]>('/teams');
  const teams: Team[] = Array.isArray(existing) ? existing : (existing.data ?? []);
  const byKey = (k: string) => teams.find((t) => t.key === k || t.name.toLowerCase() === k);

  const eng =
    byKey('engineering') ??
    (await post<Team>('/teams', { name: 'Engineering', issueType: 'task' }));
  const qc = byKey('qc') ?? (await post<Team>('/teams', { name: 'QC', issueType: 'bug' }));
  const design = await post<Team>('/teams', { name: 'Design', issueType: 'task', icon: 'palette' });

  await put(`/teams/${eng.id}/statuses`, { statuses: ENG_STATUSES });
  await put(`/teams/${eng.id}/labels`, { labels: ENG_LABELS });
  await put(`/teams/${qc.id}/statuses`, { statuses: QC_STATUSES });
  await put(`/teams/${qc.id}/labels`, { labels: QC_LABELS });
  await put(`/teams/${design.id}/statuses`, { statuses: DESIGN_STATUSES });
  console.log(`\n🏷  Teams: ${eng.name} · ${qc.name} · ${design.name}`);

  // ── The product this all belongs to ─────────────────────────────────────────
  const project = await post('/projects', {
    title: 'Mobile banking app',
    subtitle: 'iOS and Android, ~40k monthly actives',
    owner: PEOPLE[1].name,
    environment: 'production',
  });
  console.log(`📦 Project "${project.title}"`);

  // ── Cycles, before any issue exists ─────────────────────────────────────────
  // **Order matters twice over.**
  //
  // A team with cycles on auto-adds new issues to the running cycle, so turning
  // it on *first* is the whole reason the cycle board has anything in it. And
  // changing the rhythm afterwards rebuilds every cycle from scratch, which
  // clears the membership we just earned — so this runs once and is never
  // touched again.
  //
  // Anchored six days back, not two weeks: an anchor whose cycle has already
  // ended rolls forward rather than back-dating, so `-14` would put cycle 1 at
  // *today* — day zero, an empty burn-up. Six days lands us mid-flight, a week
  // of history behind and a week of runway ahead.
  await patch(`/teams/${eng.id}/cycle-config`, {
    cyclesEnabled: true,
    cycleMode: 'auto',
    cycleLengthWeeks: 2,
    cycleCooldownWeeks: 0,
    cycleStartDate: day(-6),
    cycleAutoRollover: true,
  });
  const cycles = await get<any>(`/teams/${eng.id}/cycles`);
  const cycleList: any[] = Array.isArray(cycles) ? cycles : (cycles.data ?? []);
  const active = cycleList.find((c) => c.status === 'active');
  if (active) {
    await patch(`/teams/${eng.id}/cycles/${active.id}`, {
      description:
        'Passkey enrolment behind a flag on iOS and Android, and the transaction list ' +
        'interactive under 1s on a mid-range device. Everything else is displaceable.',
    });
  }
  console.log(
    `🔁 Cycles on for ${eng.name} — ${cycleList.length} planned, 2-week rhythm` +
      (active ? `, cycle ${active.number} running with a goal` : ''),
  );

  // ── Issues ──────────────────────────────────────────────────────────────────
  async function seedIssues(team: Team, kind: 'task' | 'bug', list: Seeded[]): Promise<any[]> {
    const made: any[] = [];
    for (const s of list) {
      // Filed by the person, not by the seed. The reporter comes from the
      // caller's token, so creating everything as the admin gives you thirty
      // bugs all "reported by Ada" — on a board whose whole point is who found
      // what.
      const filer = s.reporter ?? s.assignee;
      const issue = await post(
        '/issues',
        {
          kind,
          teamId: team.id,
          title: s.title,
          status: s.status,
          ...(s.description ? { description: s.description } : {}),
          ...(s.assignee ? { assigneeIds: who(s.assignee) } : {}),
          ...(s.start !== undefined ? { startDate: day(s.start) } : {}),
          ...(s.end !== undefined ? { endDate: day(s.end) } : {}),
          ...(s.estimate !== undefined ? { estimate: s.estimate } : {}),
          ...(s.severity ? { severity: s.severity } : {}),
          ...(s.type ? { type: s.type } : {}),
        },
        filer ? await tokenFor(filer) : undefined,
      );
      made.push(issue);

      for (const sub of s.subtasks ?? []) {
        await post('/issues', {
          kind: 'task',
          teamId: team.id,
          parentId: issue.id,
          title: sub.title,
          status: sub.status,
          ...(sub.assignee ? { assigneeIds: who(sub.assignee) } : {}),
        });
      }
      for (const c of s.comments ?? []) {
        await post(`/issues/${issue.id}/comments`, { body: c.body }, await tokenFor(c.by));
      }
    }
    return made;
  }

  const engIssues = await seedIssues(eng, 'task', ENG_ISSUES);
  const qcIssues = await seedIssues(qc, 'bug', QC_ISSUES);
  const designIssues = await seedIssues(design, 'task', DESIGN_ISSUES);
  const subCount = [...ENG_ISSUES, ...QC_ISSUES, ...DESIGN_ISSUES].reduce(
    (n, s) => n + (s.subtasks?.length ?? 0),
    0,
  );
  console.log(
    `\n📋 ${engIssues.length + qcIssues.length + designIssues.length} issues ` +
      `(+${subCount} sub-tasks) across the three boards`,
  );

  // ── A relation that crosses the kinds ───────────────────────────────────────
  // A bug blocking a task is the cross-type link the model exists for; a demo
  // where every relation stays inside one board never shows it.
  await post('/issue-links', {
    issueType: 'bug',
    sourceId: qcIssues[0].id,
    targetId: engIssues[0].id,
    relationType: 'blocks',
  });
  await post('/issue-links', {
    issueType: 'task',
    sourceId: engIssues[1].id,
    targetId: engIssues[12].id,
    relationType: 'related_to',
  });
  console.log('🔗 Linked a critical bug as blocking the passkey work');

  // ── The admin's private board ───────────────────────────────────────────────
  for (const p of PERSONAL) {
    await post('/issues', {
      kind: 'task',
      personal: true,
      title: p.title,
      status: p.status,
      ...(p.end !== undefined ? { endDate: day(p.end) } : {}),
    });
  }
  console.log(`🔒 ${PERSONAL.length} personal tasks on ${owner.name}'s private board`);

  // ── The quarter's OKRs ──────────────────────────────────────────────────────
  // Before the roadmap, because its items point back at these key results.
  const milestone = await post('/milestones', {
    title: 'H2 2026 objectives',
    timeframe: 'Jul–Dec 2026',
  });
  await put(`/milestones/${milestone.id}/objectives`, { objectives: OBJECTIVES });
  console.log(
    `\n🎯 OKRs "${milestone.title}" — ${OBJECTIVES.length} objectives, ` +
      `${OBJECTIVES.reduce((n, o) => n + o.keyResults.length, 0)} key results`,
  );

  // ── The backlog ─────────────────────────────────────────────────────────────
  const roadmap = await post('/roadmaps', {
    title: 'Mobile banking · 2026',
    description: 'What we are betting on this year, and what we are deliberately not.',
    projectId: project.id,
  });
  await put(`/roadmaps/${roadmap.id}/epics`, { epics: EPICS });
  await put(`/roadmaps/${roadmap.id}/items`, {
    items: BACKLOG.map((b, i) => ({
      id: `item-${i + 1}`,
      title: b.title,
      description: b.description ?? '',
      phase: b.phase,
      epicId: b.epicId,
      status: b.status,
      difficulty: b.difficulty,
      reach: b.reach,
      impact: b.impact,
      confidence: b.confidence,
      effort: b.effort,
      progress: b.progress,
      imageUrl: '',
      startDate: b.start !== undefined ? day(b.start) : '',
      endDate: b.end !== undefined ? day(b.end) : '',
      assignees: b.phase === 'now' ? [{ id: users.minh, name: 'Minh Tran' }] : [],
      milestoneId: ITEM_OKR[b.title] ? milestone.id : '',
      objectiveId: ITEM_OKR[b.title]?.objectiveId ?? '',
      keyResultId: ITEM_OKR[b.title]?.keyResultId ?? '',
      // Stored alongside the id on purpose — the public roadmap has no access to
      // the milestone, so the label has to travel with the item.
      okrLabel: ITEM_OKR[b.title]?.label ?? '',
    })),
  });
  console.log(`\n🗺  Backlog "${roadmap.title}" — ${BACKLOG.length} items in ${EPICS.length} epics`);

  // ── Hang the delivery work off the bet it belongs to ─────────────────────────
  const saved = await get(`/roadmaps/${roadmap.id}`);
  const passkey = (saved.items ?? []).find((i: any) => i.title === 'Passkey sign-in');
  if (passkey) {
    for (const issue of [engIssues[0], qcIssues[0], designIssues[0]]) {
      await patch(`/issues/${issue.id}`, {
        roadmapId: roadmap.id,
        roadmapItemId: passkey.id,
        roadmapItemLabel: passkey.title,
      });
    }
    console.log('   ↳ three issues linked to "Passkey sign-in" so the item has real sub-work');
  }

  // ── A doc ───────────────────────────────────────────────────────────────────
  const doc = await post('/docs', { title: 'Product handbook', icon: 'book' });
  const pages: { title: string; content: string }[] = [
    {
      title: 'How we decide what to build',
      content:
        '<h2>The short version</h2><p>We bet on outcomes, not features. Every item on the backlog names the outcome it is supposed to move, and how we would know.</p>' +
        '<h3>What gets built</h3><ul><li>It moves a number we have agreed matters</li><li>Somebody has talked to the people who would use it</li><li>We can ship a first slice inside one cycle</li></ul>' +
        '<p>RICE is a sorting aid, not the decision. A high score on a bet nobody believes in is a sign the inputs are wrong.</p>',
    },
    {
      title: 'How a cycle runs',
      content:
        '<p>Two weeks, no cooldown. Scope is set at the start and does not grow mid-cycle — anything urgent displaces something, and the displacement is written down.</p>' +
        '<h3>The rhythm</h3><ol><li><strong>Day 1</strong> — planning, scope agreed, cycle goal written on the board</li><li><strong>Daily</strong> — the board is the standup</li><li><strong>Last day</strong> — review, and whatever is unfinished rolls forward automatically</li></ol>',
    },
    {
      title: 'Bug triage',
      content:
        '<p>Severity is about consequence, not annoyance.</p>' +
        '<ul><li><strong>Critical</strong> — money or data is wrong, or nobody can sign in. Fix now, no matter what cycle we are in.</li>' +
        '<li><strong>High</strong> — a core journey is broken for a real group of people. Next cycle at the latest.</li>' +
        '<li><strong>Medium</strong> — it works, badly. Scheduled like any other work.</li>' +
        '<li><strong>Low</strong> — cosmetic. Batched.</li></ul>' +
        '<p>Every critical gets a written cause, not just a fix.</p>',
    },
  ];
  for (const p of pages) await post(`/docs/${doc.id}/pages`, p);
  console.log(`📄 Doc "${doc.title}" — ${pages.length} pages`);

  // ── Testing ─────────────────────────────────────────────────────────────────
  // A report is created empty and then has its sections written in one PUT —
  // sections are a replace, not an append, so everything a feature contains goes
  // up together.
  // Keyed by the case's expected result, which is unique across the suite and is
  // how the bugs below name the case they came from.
  const caseRefs: Record<string, { reportId: string; caseId: string; label: string }> = {};
  for (const f of FEATURES) {
    const report = await post(`/projects/${project.id}/reports`, {
      title: f.title,
      label: f.label,
      statusVariant: f.status,
    });
    // The header fields aren't on the create DTO, only the update one.
    await patch(`/projects/${project.id}/reports/${report.id}`, {
      subtitle: f.subtitle,
      featureId: f.featureId,
      module: f.module,
      owner: PEOPLE.find((p) => p.key === f.owner)!.name,
      reported: day(f.reported),
    });
    const cases = f.cases.map((c, i) => {
      const shortId = `TC-${String(i + 1).padStart(2, '0')}`;
      const id = randomUUID();
      caseRefs[c.expected] = { reportId: report.id, caseId: id, label: `${shortId} · ${c.area}` };
      return {
        id,
        shortId,
        area: c.area,
        type: c.type,
        result: c.result,
        owner: PEOPLE.find((p) => p.key === c.owner)!.name,
        precondition: c.precondition ?? '',
        testSteps: c.steps,
        expectedResult: c.expected,
        actualResult: c.actual ?? '',
        note: c.note ?? '',
      };
    });
    await put(`/projects/${project.id}/reports/${report.id}/sections`, {
      sections: [
        { id: randomUUID(), type: 'overview', title: 'Overview', paragraphs: f.overview },
        {
          id: randomUUID(),
          type: 'testing',
          title: 'Test cases',
          banner: f.banner,
          coverage: f.coverage,
          cases,
        },
      ],
    });
  }
  const caseCount = FEATURES.reduce((n, f) => n + f.cases.length, 0);
  console.log(
    `🧪 ${FEATURES.length} test features under "${project.title}" — ${caseCount} cases ` +
      `(${FEATURES.flatMap((f) => f.cases).filter((c) => c.result === 'Failed').length} failing)`,
  );

  // A failed case is where a bug comes from, so say so on the bug — its detail
  // screen then names the case it was raised from. Matched on the bug's title
  // and the case's expected result, both of which are written above.
  const raisedFrom: [string, string][] = [
    ['Transfer confirmation', 'The recipient balance after the transfer.'],
    ['Amount field accepts', 'The field refuses more than two decimal places.'],
    ['Onboarding tooltip', 'Every control is reachable and announced.'],
  ];
  for (const [titlePrefix, expected] of raisedFrom) {
    const issue = qcIssues.find((i) => i.title.startsWith(titlePrefix));
    const ref = caseRefs[expected];
    if (!issue || !ref) continue;
    await patch(`/issues/${issue.id}`, {
      reportId: ref.reportId,
      caseId: ref.caseId,
      caseLabel: ref.label,
    });
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  const web = API.replace(':3000/v1', ':3001').replace('/v1', '');
  console.log('\n────────────────────────────────────────────');
  console.log(`Open ${web} and sign in as any of:\n`);
  for (const p of PEOPLE) {
    console.log(`  ${email(p.local).padEnd(20)} ${PASSWORD}   (${p.role})`);
  }
  console.log('\nEach role sees a different app — sign in as Thu or Khoa to see');
  console.log('the screens an admin never notices are gated.');
  console.log('\nRe-run with --reset to throw it away and start over.');
}

main().catch(async (err) => {
  console.error('\n❌ Seed failed:', err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

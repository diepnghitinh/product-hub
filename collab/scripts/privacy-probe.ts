/**
 * Can a colleague open someone else's *private* doc over the live editing socket?
 *
 * The REST API is only half the answer: the Yjs room is a second door into the
 * same page, and before this it asked only "is your token valid and is this your
 * workspace?". Run it against a dev stack:
 *
 *   npx tsx scripts/privacy-probe.ts --url ws://localhost:3930 --api http://localhost:3000/v1
 */
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const WS = arg('url', 'ws://localhost:3930');
const API = arg('api', 'http://localhost:3000/v1');
const DOMAIN = arg('domain', 'demo.local');
const PASSWORD = arg('password', 'demo1234');

let passed = 0;
let failed = 0;
const ok = (what: string) => {
  console.log(`  \x1b[32mPASS\x1b[0m ${what}`);
  passed++;
};
const bad = (what: string, why: string) => {
  console.log(`  \x1b[31mFAIL\x1b[0m ${what} — ${why}`);
  failed++;
};

async function login(local: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${local}@${DOMAIN}`, password: PASSWORD }),
  });
  const json = (await res.json()) as { data?: { token?: string } };
  const token = json.data?.token;
  if (!token) throw new Error(`login failed for ${local}`);
  return token;
}

async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T };
  return json.data;
}

/** The tenant id is in the token — the room name needs it. */
function tenantOf(token: string): string {
  const claims = token.split('.')[1];
  if (!claims) throw new Error('not a JWT');
  const payload = JSON.parse(Buffer.from(claims, 'base64url').toString()) as { tenantId: string };
  return payload.tenantId;
}

/**
 * Connect, and report which way it went. Hocuspocus answers an unauthorised room
 * by closing rather than by erroring the promise, so both outcomes are races
 * against a timeout — whichever lands first is the answer.
 */
function connect(room: string, token: string): Promise<'authenticated' | 'rejected' | 'timeout'> {
  return new Promise((resolve) => {
    const done = (r: 'authenticated' | 'rejected' | 'timeout') => {
      clearTimeout(timer);
      try {
        provider.destroy();
      } catch {
        /* already gone */
      }
      resolve(r);
    };
    const timer = setTimeout(() => done('timeout'), 8000);
    const provider = new HocuspocusProvider({
      url: WS,
      name: room,
      token,
      document: new Y.Doc(),
      onAuthenticated: () => done('authenticated'),
      onAuthenticationFailed: () => done('rejected'),
      onClose: () => done('rejected'),
      // Node 22+ ships a global WebSocket, which is what the provider expects a
      // browser to give it; `preserveConnection: false` makes `destroy()` drop
      // the socket instead of parking it, so the probe can exit. Neither is in
      // the published config type, so they go in here rather than as fields.
      ...{ WebSocketPolyfill: WebSocket, preserveConnection: false },
    });
  });
}

async function main() {
  const author = await login('minh'); // product — writes the doc
  const writer = await login('thu'); // tester  — can write docs, didn't write this one
  const reader = await login('linh'); // developer — read-only role
  const admin = await login('ada'); // admin — keeps the override
  const tenant = tenantOf(author);

  const doc = await api<{ id: string }>(author, 'POST', '/docs', {
    title: 'Collab privacy probe',
    icon: 'book',
  });
  const full = await api<{ pages: { id: string }[] }>(author, 'GET', `/docs/${doc.id}`);
  const firstPage = full.pages[0];
  if (!firstPage) throw new Error('a new doc should arrive with its first page');
  const room = `${tenant}:${firstPage.id}`;
  console.log(`doc=${doc.id} room=${room}\n`);

  console.log('── while it is a normal workspace doc ─────────────────────────────');
  for (const [who, token] of [
    ['author', author],
    ['a tester', writer],
    ['a developer', reader],
  ] as const) {
    const r = await connect(room, token);
    r === 'authenticated'
      ? ok(`${who} can open the live editor`)
      : bad(`${who} can open the live editor`, r);
  }

  await api(author, 'POST', `/docs/${doc.id}/privacy`, { isPrivate: true });
  console.log('\n── after the author makes it private ──────────────────────────────');

  const authorAfter = await connect(room, author);
  authorAfter === 'authenticated'
    ? ok('the author still gets in')
    : bad('the author still gets in', authorAfter);

  const adminAfter = await connect(room, admin);
  adminAfter === 'authenticated'
    ? ok('an admin still gets in')
    : bad('an admin still gets in', adminAfter);

  for (const [who, token] of [
    ['a tester', writer],
    ['a developer', reader],
  ] as const) {
    const r = await connect(room, token);
    r === 'rejected'
      ? ok(`${who} is turned away from the room`)
      : bad(`${who} is turned away from the room`, `connection was ${r}`);
  }

  console.log('\n── a room that does not exist (control) ───────────────────────────');
  const ghost = await connect(`${tenant}:00000000-0000-4000-8000-000000000000`, author);
  ghost === 'rejected'
    ? ok('an unknown page is refused too')
    : bad('an unknown page is refused too', `connection was ${ghost}`);

  await api(author, 'DELETE', `/docs/${doc.id}`);
  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

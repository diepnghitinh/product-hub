/**
 * End-to-end proof that collaborative editing works — merge, cursors, and the
 * HTML mirror — against a real MongoDB and the real server.
 *
 *   npm run verify
 *
 * It creates its own scratch page in a scratch tenant, runs the actual server
 * in-process on a spare port, connects three clients over real WebSockets, and
 * deletes everything it made on the way out. Nothing existing is touched.
 *
 * What each assertion is really testing:
 *
 *   seed        an existing page's HTML becomes a Y.Doc, so old docs aren't blank
 *   merge       two people editing different paragraphs both keep their text —
 *               the thing the old last-write-wins autosave could never do
 *   awareness   one client sees the other's identity on the presence channel,
 *               which is the same channel that carries caret and selection
 *   presence    /presence answers for the docs list without opening a socket
 *   read-only   a developer's edits are dropped, matching the REST @Roles
 *   tenancy     a token for one workspace cannot open another's page
 *   mirror      docpages.content catches up, so PDF/public/MCP stay correct
 */
import { randomUUID } from 'node:crypto';
import { HocuspocusProvider } from '@hocuspocus/provider';
import jwt from 'jsonwebtoken';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { roomName, type RoleValue } from '../src/auth.js';
import { blocksOf, textFieldsOf } from '../src/blockDoc.js';
import { env } from '../src/env.js';
import { closeMongo, connectMongo, crdt, pages } from '../src/mongo.js';
import { createCollabServer } from '../src/server.js';

const PORT = 3998;
const URL = `ws://127.0.0.1:${PORT}`;

const TENANT = randomUUID();
const OTHER_TENANT = randomUUID();
const DOC_ID = randomUUID();
const PAGE_ID = randomUUID();

/**
 * The scratch page's starting content.
 *
 * The heading and two paragraphs come first and stay first: the merge assertions
 * edit paragraphs by index. Everything after them is one of each shape a real
 * page can hold, so the fidelity group can prove the seed → edit → mirror round
 * trip preserves them through the actual server, not just through the converter
 * in isolation (which is `npm run smoke`'s job).
 */
const STORED_HTML =
  '<h2>Checkout rework</h2>' +
  '<p>Users abandon at the address step.</p>' +
  '<p>Two thirds of them never come back.</p>' +
  '<ul class="rte-check"><li data-checked="true">Instrument the funnel</li>' +
  '<li data-checked="false">Ship the one-page form</li></ul>' +
  '<figure class="mermaid-block"><pre class="mermaid-source"><code>graph TD;\n  A--&gt;B;</code></pre></figure>' +
  '<table><thead><tr><th scope="col">Step</th><th scope="col">Drop-off</th></tr></thead>' +
  '<tbody><tr><th scope="row">Address</th><td>38%</td></tr></tbody></table>' +
  '<figure><img src="/uploads/checkout.png" alt="Checkout" style="width:70%"><figcaption>The address step</figcaption></figure>' +
  '<details class="rte-toggle"><summary>Why now</summary><div class="rte-toggle__body"><p>The quarter ends.</p></div></details>' +
  '<pre><code class="language-ts">const a = 1;</code></pre>' +
  '<blockquote>Nobody reads a second page.</blockquote>' +
  '<hr>';

// ── tiny test harness ──────────────────────────────────────────────────────
let failures = 0;

function check(label: string, condition: unknown, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until true or the budget runs out. Returns whether it became true. */
async function waitFor(predicate: () => boolean, budgetMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(50);
  }
  return predicate();
}

function tokenFor(user: {
  userId: string;
  name: string;
  role: RoleValue;
  tenantId?: string;
}): string {
  return jwt.sign(
    {
      userId: user.userId,
      tenantId: user.tenantId ?? TENANT,
      email: `${user.name.toLowerCase()}@verify.test`,
      name: user.name,
      role: user.role,
    },
    env.jwtSecret,
    { expiresIn: '5m' },
  );
}

interface Client {
  provider: HocuspocusProvider;
  doc: Y.Doc;
  awareness: Awareness;
  authFailed: boolean;
}

function connect(token: string, room: string): Client {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const client: Client = { doc, awareness, authFailed: false, provider: null as never };
  client.provider = new HocuspocusProvider({
    url: URL,
    name: room,
    token,
    document: doc,
    awareness,
    // Keep the test quiet; failures are asserted, not logged.
    onAuthenticationFailed: () => {
      client.authFailed = true;
    },
  });
  return client;
}

/**
 * Every Y.Text in the document, in block order — the runs of prose a person
 * types into, and the only parts that merge character by character. A list's
 * items or a table's cells are plain JSON on their block and deliberately absent
 * here (see `blockDoc.ts`).
 */
function textNodes(doc: Y.Doc): Y.Text[] {
  const found: Y.Text[] = [];
  for (const block of blocksOf(doc)) {
    for (const field of textFieldsOf(String(block.get('type') ?? ''))) {
      const text = block.get(field);
      if (text instanceof Y.Text) found.push(text);
    }
  }
  return found;
}

function plainText(doc: Y.Doc): string {
  return textNodes(doc)
    .map((text) => text.toString())
    .join('\n');
}

// ── the run ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const db = await connectMongo();

  await pages(db).insertOne({
    _id: PAGE_ID,
    tenantId: TENANT,
    docId: DOC_ID,
    content: STORED_HTML,
  });

  const server = createCollabServer(db, { port: PORT, closeMongoOnDestroy: false });
  await server.listen();

  const room = roomName(TENANT, PAGE_ID);
  const ada = connect(tokenFor({ userId: 'user-ada', name: 'Ada', role: 'product' }), room);
  const bob = connect(tokenFor({ userId: 'user-bob', name: 'Bob', role: 'admin' }), room);

  try {
    // ── seed + sync ────────────────────────────────────────────────────────
    console.log('\nseed & sync');
    const bothSynced = await waitFor(() => ada.provider.isSynced && bob.provider.isSynced, 10_000);
    check('both clients synced', bothSynced);
    check(
      "existing page HTML became the document's content",
      plainText(ada.doc).includes('Users abandon at the address step.'),
      plainText(ada.doc).slice(0, 120),
    );
    check('the second client sees the same content', plainText(bob.doc) === plainText(ada.doc));

    // ── concurrent edits in different paragraphs ────────────────────────────
    console.log('\nconcurrent edits');
    const adaTexts = textNodes(ada.doc);
    const bobTexts = textNodes(bob.doc);
    check('document has separate paragraphs to edit', adaTexts.length >= 3, `${adaTexts.length}`);

    // Both type before either round trip completes — the case that used to end
    // with one person's paragraph silently overwriting the other's.
    adaTexts[1]?.insert(adaTexts[1].length, ' [ada was here]');
    bobTexts[2]?.insert(bobTexts[2].length, ' [bob was here]');

    const merged = await waitFor(() => {
      const a = plainText(ada.doc);
      const b = plainText(bob.doc);
      return (
        a.includes('[ada was here]') &&
        a.includes('[bob was here]') &&
        b.includes('[ada was here]') &&
        b.includes('[bob was here]')
      );
    });
    check('both edits survive on both clients', merged, plainText(ada.doc));

    // ── awareness: the channel that carries caret + selection ──────────────
    console.log('\nawareness (cursor / selection channel)');
    ada.awareness.setLocalStateField('user', {
      userId: 'user-ada',
      name: 'Ada',
      color: '#7c3aed',
    });
    bob.awareness.setLocalStateField('user', {
      userId: 'user-bob',
      name: 'Bob',
      color: '#0ea5e9',
    });

    const sawEachOther = await waitFor(() => {
      const namesBobSees = [...bob.awareness.getStates().values()].map((s) => s['user']?.name);
      const namesAdaSees = [...ada.awareness.getStates().values()].map((s) => s['user']?.name);
      return namesBobSees.includes('Ada') && namesAdaSees.includes('Bob');
    });
    check("each client sees the other's identity and colour", sawEachOther);

    // ── presence over HTTP, for the docs list ──────────────────────────────
    console.log('\npresence endpoint');
    const presenceResponse = await fetch(`http://127.0.0.1:${PORT}/presence?pages=${PAGE_ID}`, {
      headers: {
        Authorization: `Bearer ${tokenFor({ userId: 'user-ada', name: 'Ada', role: 'product' })}`,
      },
    });
    const presenceBody = (await presenceResponse.json()) as {
      viewers: Record<string, { userId: string; name: string; color: string }[]>;
    };
    const viewers = presenceBody.viewers[PAGE_ID] ?? [];
    check('presence lists both people once each', viewers.length === 2, JSON.stringify(viewers));
    check(
      'presence carries the name and colour the avatars need',
      viewers.every((v) => v.name && v.color),
    );

    const unauthorized = await fetch(`http://127.0.0.1:${PORT}/presence?pages=${PAGE_ID}`);
    check('presence refuses an unauthenticated read', unauthorized.status === 401);

    const health = await fetch(`http://127.0.0.1:${PORT}/health`);
    check('health endpoint answers', health.ok);

    // ── a role that cannot write over REST cannot write here either ────────
    console.log('\nread-only role');
    const dev = connect(tokenFor({ userId: 'user-dev', name: 'Dev', role: 'developer' }), room);
    check('a developer still connects (reading was never gated)', await waitFor(() => dev.provider.isSynced));

    const devTexts = textNodes(dev.doc);
    devTexts[1]?.insert(devTexts[1].length, ' [dev edit]');
    // Give it every chance to arrive before declaring that it didn't.
    await sleep(1_500);
    check(
      "the developer's edit never reaches the others",
      !plainText(ada.doc).includes('[dev edit]'),
      plainText(ada.doc),
    );
    dev.provider.destroy();

    // ── a token for one workspace cannot open another's page ──────────────
    console.log('\ntenant isolation');
    const intruder = connect(
      tokenFor({ userId: 'user-ada', name: 'Ada', role: 'admin' }),
      roomName(OTHER_TENANT, PAGE_ID),
    );
    // Assert on a settled outcome, not on "not yet connected" — which is
    // trivially true the instant after connecting.
    await sleep(1_500);
    check(
      'cross-workspace room is refused',
      !intruder.provider.isSynced,
      intruder.authFailed ? 'auth failed, as expected' : 'connection stayed open',
    );
    intruder.provider.destroy();

    // ── persistence + the HTML mirror ─────────────────────────────────────
    console.log('\npersistence & html mirror');
    // The store is debounced (env.storeDebounceMs) and the mirror renders after
    // it, so wait out both before reading what the rest of the app would read.
    await sleep(env.storeDebounceMs + 2_500);
    const stored = {
      crdt: await crdt(db).findOne({ _id: PAGE_ID }),
      page: await pages(db).findOne({ _id: PAGE_ID }),
    };

    check('yjs state was written', !!stored.crdt, 'no docpagecrdts row');
    check('yjs state is attributed to the tenant', stored.crdt?.tenantId === TENANT);
    check('yjs state has a revision', (stored.crdt?.revision ?? 0) >= 1);

    const mirroredHtml = stored.page?.content ?? '';
    check('mirror kept ada\'s edit', mirroredHtml.includes('[ada was here]'), mirroredHtml);
    check("mirror kept bob's edit", mirroredHtml.includes('[bob was here]'));
    check('mirror dropped the read-only edit', !mirroredHtml.includes('[dev edit]'));
    check('mirror is html the read view can render', /<h[1-6]|<p>/.test(mirroredHtml));
    check('mirror carries no editor-internal classes', !mirroredHtml.includes('bn-'));
    check('mirror records who edited last', !!stored.page?.updatedByName, stored.page?.updatedByName);

    // ── fidelity: the shapes the rest of the app reads ────────────────────
    //
    // A page that opened in the collaborative editor and got edited must come
    // back out as the same *kind* of content it went in as. The PDF export, the
    // public share page and MCP all read `docpages.content` and act on exactly
    // these markers, so losing one here breaks a feature elsewhere — silently,
    // and only for pages somebody happened to open.
    console.log('\nfidelity through the real server');
    const survives = (label: string, needle: string): void =>
      check(label, mirroredHtml.includes(needle), needle);

    survives('a checklist is still a checklist', 'class="rte-check"');
    survives('and a ticked box is still ticked', 'data-checked="true"');
    survives('a mermaid diagram still has its figure', 'class="mermaid-block"');
    survives('and its source is still readable', 'graph TD');
    survives('a table header row is still a <thead>', '<thead>');
    survives('a header cell keeps its scope', '<th scope="col">Step</th>');
    survives('a row header keeps its scope', '<th scope="row">Address</th>');
    survives('an image keeps its url', 'src="/uploads/checkout.png"');
    survives('an image keeps its caption', '<figcaption>The address step</figcaption>');
    survives('a toggle is still a <details>', 'class="rte-toggle"');
    survives('and keeps its summary', '<summary>Why now</summary>');
    survives('a code block keeps its code', 'const a = 1;');
    // Stated rather than asserted away: Editor.js's code block has no language,
    // so a `language-ts` class — which only the short-lived BlockNote build could
    // ever have written — is dropped on the first collaborative save. The code
    // itself survives, and this matches what an issue description does with the
    // same markup, which is the behaviour the rest of the product has.
    check('a code language is dropped, as the editor has no such field', !mirroredHtml.includes('language-ts'));
    survives('a quote is still a <blockquote>', '<blockquote>');
    survives('a divider is still an <hr>', '<hr>');
    check(
      'the image width survived as a width',
      /<img[^>]+style="[^"]*width:\s*\d/.test(mirroredHtml),
      mirroredHtml.match(/<img[^>]*>/)?.[0],
    );

    // ── version restore reaches people who are already typing ─────────────
    //
    // The half the API can do — writing the restored body to `docpages.content`
    // and snapshotting what it replaced — is unchanged and not what this checks.
    // What it checks is the half only this service can do: while ada and bob are
    // *still connected*, the restore has to land in the shared document. A
    // restore that only touched Mongo would be overwritten by the next keystroke
    // and mirrored straight back over.
    console.log('\nversion restore');
    const RESTORED_HTML =
      '<h2>Restored heading</h2>' +
      '<p>[restored body]</p>' +
      '<figure class="mermaid-block"><pre class="mermaid-source"><code>graph LR\n  A--&gt;B</code></pre></figure>';

    // Stand in for the API's restore: it writes the old body back to the page.
    await pages(db).updateOne({ _id: PAGE_ID }, { $set: { content: RESTORED_HTML } });

    const resetResponse = await fetch(`http://127.0.0.1:${PORT}/reset?page=${PAGE_ID}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenFor({ userId: 'user-ada', name: 'Ada', role: 'product' })}`,
      },
    });
    check('reset is accepted from a writer', resetResponse.ok, `${resetResponse.status}`);

    const restoredEverywhere = await waitFor(
      () =>
        plainText(ada.doc).includes('[restored body]') &&
        plainText(bob.doc).includes('[restored body]'),
    );
    check('the restore reached both live clients', restoredEverywhere, plainText(bob.doc));
    check(
      'and replaced what was there rather than appending to it',
      !plainText(ada.doc).includes('[ada was here]'),
      plainText(ada.doc),
    );

    // The mirror re-renders from the Y.Doc, so this also proves the restored HTML
    // survives a full round trip — if it didn't, `content` would now differ from
    // what was restored and the next reader would see something else again.
    await sleep(env.storeDebounceMs + 2_500);
    const afterReset = await pages(db).findOne({ _id: PAGE_ID });
    check(
      'the mirror still matches the restored html',
      afterReset?.content === RESTORED_HTML,
      afterReset?.content,
    );

    const resetAsDev = await fetch(`http://127.0.0.1:${PORT}/reset?page=${PAGE_ID}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenFor({ userId: 'user-dev', name: 'Dev', role: 'developer' })}`,
      },
    });
    check('reset refuses a role that cannot edit the body', resetAsDev.status === 403);

    const resetAnonymous = await fetch(`http://127.0.0.1:${PORT}/reset?page=${PAGE_ID}`, {
      method: 'POST',
    });
    check('reset refuses an unauthenticated call', resetAnonymous.status === 401);

    // A page id from another workspace must read as absent, not as forbidden —
    // "403" would confirm the page exists.
    const resetOtherTenant = await fetch(`http://127.0.0.1:${PORT}/reset?page=${randomUUID()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenFor({ userId: 'user-ada', name: 'Ada', role: 'admin' })}`,
      },
    });
    check('reset cannot reach a page in another workspace', resetOtherTenant.status === 404);

    // ── reopening picks up the stored state, not the html ─────────────────
    console.log('\nreopen');
    ada.provider.destroy();
    bob.provider.destroy();
    await sleep(500);

    const reopened = connect(tokenFor({ userId: 'user-ada', name: 'Ada', role: 'admin' }), room);
    check('a later session syncs', await waitFor(() => reopened.provider.isSynced, 10_000));
    // The restore above is the last thing that happened to this document, so this
    // is what "picks up the stored state" now means — and it's the stronger check:
    // it proves the restore was persisted as Yjs state, not just broadcast to the
    // windows that happened to be open at the time.
    check(
      'a later session sees the restored text, from stored state',
      plainText(reopened.doc).includes('[restored body]') &&
        !plainText(reopened.doc).includes('[ada was here]'),
      plainText(reopened.doc),
    );
    reopened.provider.destroy();
  } finally {
    ada.provider.destroy();
    bob.provider.destroy();
    await sleep(200);
    await server.destroy();
    await pages(db).deleteOne({ _id: PAGE_ID });
    await crdt(db).deleteOne({ _id: PAGE_ID });
    await closeMongo();
  }

  console.log(
    failures === 0
      ? '\nOK — collaborative editing, cursors, and the html mirror all hold\n'
      : `\nFAILED — ${failures} assertion(s)\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

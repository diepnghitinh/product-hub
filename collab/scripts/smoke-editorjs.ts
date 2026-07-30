/**
 * The two things this service can get wrong, tested without a database.
 *
 *   npm run smoke
 *
 * **Fidelity** — a page's stored HTML seeds a Y.Doc, and that Y.Doc renders back
 * to HTML the rest of the app can read. Eight consumers read `docpages.content`
 * (PDF export, public share links, MCP, version snapshots, …) and none of them
 * know the CRDT exists, so every shape has to survive the trip unchanged.
 *
 * **Convergence** — two people editing the same page end up with the same
 * document. That is the claim "realtime" makes, and since Editor.js has no CRDT
 * binding of its own, the claim rests on the shape in `blockDoc.ts` being right:
 * text in a Y.Text merges, everything else resolves per block. Both halves are
 * asserted here rather than assumed, because the failure mode of getting it
 * wrong is silent — two windows that look fine and disagree.
 */
import * as Y from 'yjs';
import { blocksOf, readBlocks, textOf, toYBlock, type YBlock } from '../src/blockDoc.js';
import { blocksToHtml, type HtmlEditorBlock } from '../src/editorjs.js';
import { convertHtml, resetYDocFromHtml, seedYDocFromHtml, ydocToHtml } from '../src/ydoc.js';

let failures = 0;
let checks = 0;

function check(condition: unknown, message: string): void {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${message}`);
  }
}

function group(name: string): void {
  console.log(`\n${name}`);
}

/**
 * A round trip that goes all the way through Yjs, not just through the
 * converters. That matters: the Y.Doc is where a block's data has to survive,
 * and the text/JSON split happens there rather than in the parser.
 */
function throughYjs(html: string): string {
  const doc = new Y.Doc();
  seedYDocFromHtml(doc, html);
  return ydocToHtml(doc);
}

/** Two documents, synced both ways — what the sync server does over a socket. */
function exchange(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
}

/** A second window on the same page. */
function fork(a: Y.Doc): Y.Doc {
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return b;
}

const textAt = (doc: Y.Doc, index: number, field = 'text'): Y.Text =>
  blocksOf(doc).get(index).get(field) as Y.Text;

function main(): void {
  // ── Fidelity: every shape the database already holds ──────────────────────
  group('prose');
  {
    const out = throughYjs(
      '<p>Users <b>abandon</b> at the <i>address</i> step, <u>twice</u>, <s>maybe</s> <code>POST /pay</code>.</p>',
    );
    check(out.includes('<b>abandon</b>'), 'bold stays <b>');
    check(out.includes('<i>address</i>'), 'italic stays <i>');
    check(out.includes('<u>twice</u>'), 'underline survives');
    check(out.includes('<s>maybe</s>'), 'strikethrough survives');
    check(out.includes('<code>POST /pay</code>'), 'inline code survives');
  }

  group('headings, links, quote, divider');
  {
    const out = throughYjs(
      '<h1>One</h1><h3>Three</h3><p>See <a href="https://example.com/x?a=1&amp;b=2">the spec</a>.</p>' +
        '<blockquote>Help me pay fast.</blockquote><hr>',
    );
    check(/<h1>One<\/h1>/.test(out), 'h1 round-trips');
    check(/<h3>Three<\/h3>/.test(out), 'h3 keeps its level');
    check(out.includes('href="https://example.com/x?a=1&amp;b=2"'), 'href keeps its entities');
    check(out.includes('<blockquote>Help me pay fast.</blockquote>'), 'a quote round-trips');
    check(out.includes('<hr>'), 'a divider survives');
  }

  group('lists');
  {
    const out = throughYjs(
      '<ul><li>One-page form</li><li>Remember address<ul><li>per user</li></ul></li></ul><ol><li>First</li><li>Second</li></ol>',
    );
    check(out.includes('<li>One-page form</li>'), 'an item is <li>text</li>, with no <p> wrapper');
    check(out.includes('<ul><li>per user</li></ul></li>'), 'a nested list stays inside its item');
    check(/<ol><li>First<\/li><li>Second<\/li><\/ol>/.test(out), 'ordered list is one <ol>');
  }

  group('checklist — ticks are data, not decoration');
  {
    const out = throughYjs(
      '<ul class="rte-check"><li data-checked="true">Ship it</li><li data-checked="false">Write it up</li></ul>',
    );
    check(out.includes('class="rte-check"'), 'the rte-check class survives');
    check(out.includes('data-checked="true">Ship it'), 'a ticked item stays ticked');
    check(out.includes('data-checked="false">Write it up'), 'an unticked item stays unticked');
  }

  group('mermaid — a diagram, not a code block');
  {
    const stored =
      '<figure class="mermaid-block"><pre class="mermaid-source"><code>graph TD\nA--&gt;B\nB--&gt;C</code></pre></figure>';
    const out = throughYjs(stored);
    check(out.includes('class="mermaid-block"'), 'the figure marker survives, so it still draws');
    check(out.includes('A--&gt;B'), "the arrow stays escaped exactly once ('-->' is the diagram)");
    check(!out.includes('--&amp;gt;'), 'and gained no second layer of escaping');
    check(convertHtml(stored).blocks[0]?.type === 'mermaid', 'stored as its own block type');
  }

  group('toggle');
  {
    const stored =
      '<details class="rte-toggle"><summary>Open questions</summary><div class="rte-toggle__body"><p>Payment provider?</p></div></details>';
    const out = throughYjs(stored);
    check(out.includes('<details class="rte-toggle">'), 'a toggle is still <details>');
    check(out.includes('<summary>Open questions</summary>'), 'the headline survives');
    check(out.includes('Payment provider?'), 'the folded body survives');
  }

  group('code');
  {
    const out = throughYjs('<pre><code>if (a &gt; 0) {\n  ship();\n}</code></pre>');
    check(out.includes('<pre><code>'), 'a code block is still <pre><code>');
    check(out.includes('if (a &gt; 0)'), 'the comparison stays escaped once');
    check(out.includes('\n  ship();'), 'indentation and newlines survive');
  }

  group('table — header semantics are accessibility, not styling');
  {
    const out = throughYjs(
      '<table><thead><tr><th scope="col">Step</th><th scope="col">Drop-off</th></tr></thead>' +
        '<tbody><tr><th scope="row">Address</th><td>38%</td></tr></tbody></table>',
    );
    check(out.includes('<thead>'), 'the header row is still in a <thead>');
    check(out.includes('<th scope="col">Step</th>'), 'a header row cell is <th scope="col">');
    check(out.includes('<th scope="row">Address</th>'), 'a header column cell is <th scope="row">');
    check(out.includes('<td>38%</td>'), 'body cells stay <td>');
  }

  group('table — dragged column widths');
  {
    const out = throughYjs(
      '<table style="table-layout:fixed;width:100%"><colgroup><col style="width:25%"><col style="width:75%"></colgroup>' +
        '<tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
    );
    check(out.includes('<colgroup>'), 'widths come back as a colgroup');
    check(out.includes('table-layout:fixed'), 'fixed layout stays inline so read views honour it');
    // Read the widths out of the colgroup alone — the table's own
    // `style="…width:100%"` is not a column width.
    const colgroup = out.match(/<colgroup>.*?<\/colgroup>/s)?.[0] ?? '';
    const pct = [...colgroup.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
    check(
      pct.length >= 2 && Math.abs(pct[0]! - 25) < 1 && Math.abs(pct[1]! - 75) < 1,
      `the 25/75 split survives (got ${pct.join('/')})`,
    );
  }

  group('media');
  {
    const out = throughYjs(
      '<figure><img src="/uploads/a.png" alt="Checkout" style="width:70%"><figcaption>The address step</figcaption></figure>' +
        '<video src="/uploads/c.mp4" controls></video>',
    );
    check(out.includes('src="/uploads/a.png"'), 'the image url survives');
    check(out.includes('<figcaption>The address step</figcaption>'), 'the caption survives');
    check(out.includes('width:70%'), 'a percentage width stays a percentage');
    check(out.includes('src="/uploads/c.mp4"'), 'a video url survives');
    check(out.includes('controls'), 'along with its controls');
  }

  // ── The CRDT shape itself ─────────────────────────────────────────────────
  group('what lands in the document');
  {
    const doc = new Y.Doc();
    seedYDocFromHtml(doc, '<h2>Checkout</h2><ul><li>One</li></ul>');
    const heading = blocksOf(doc).get(0);
    check(heading.get('text') instanceof Y.Text, "a heading's text is a Y.Text — so it merges");
    check(!('text' in ((heading.get('data') as object) ?? {})), 'and is not duplicated in data');
    check(heading.get('data') instanceof Object, "the heading's level rides in plain data");
    check(typeof heading.get('id') === 'string' && String(heading.get('id')).length > 0, 'every block carries an id');

    const list = blocksOf(doc).get(1);
    check(!(list.get('items') instanceof Y.Text), "a list's items stay whole JSON (last-writer-wins)");
    check(readBlocks(doc.getArray<YBlock>('blocks'))[1]?.type === 'list', 'and read back as a list');

    const ids = new Set(readBlocks(blocksOf(doc)).map((b) => b.id));
    check(ids.size === 2, 'ids are unique within a page');
  }

  // ── Convergence: the whole point ──────────────────────────────────────────
  group('two people, one paragraph');
  {
    const a = new Y.Doc();
    seedYDocFromHtml(a, '<p>Hello world</p>');
    const b = fork(a);

    textAt(a, 0).insert(5, ' there'); // "Hello there world"
    textAt(b, 0).insert(11, '!'); // "Hello world!"
    exchange(a, b);

    check(ydocToHtml(a) === ydocToHtml(b), 'both windows converge on the same document');
    check(
      textOf(blocksOf(a).get(0), 'text') === 'Hello there world!',
      `both edits survive (got "${textOf(blocksOf(a).get(0), 'text')}")`,
    );
  }

  group('two people, different blocks');
  {
    const a = new Y.Doc();
    seedYDocFromHtml(a, '<p>First</p><p>Second</p>');
    const b = fork(a);

    textAt(a, 0).insert(5, ' line');
    textAt(b, 1).insert(6, ' line');
    exchange(a, b);

    const [one, two] = readBlocks(blocksOf(a));
    check(one?.data['text'] === 'First line' && two?.data['text'] === 'Second line', 'neither edit is lost');
    check(ydocToHtml(a) === ydocToHtml(b), 'and the two windows agree');
  }

  group('one person types while another adds a block');
  {
    const a = new Y.Doc();
    seedYDocFromHtml(a, '<p>Intro</p>');
    const b = fork(a);

    textAt(a, 0).insert(5, ' paragraph');
    blocksOf(b).insert(1, [toYBlock({ id: 'new-block', type: 'paragraph', data: { text: 'Added' } })]);
    exchange(a, b);

    check(blocksOf(a).length === 2, 'the new block reaches the person who was typing');
    check(textOf(blocksOf(a).get(0), 'text') === 'Intro paragraph', 'without interrupting their sentence');
    check(ydocToHtml(a) === ydocToHtml(b), 'and both render the same page');
  }

  group('a version restore reaches everyone');
  {
    const a = new Y.Doc();
    seedYDocFromHtml(a, '<p>Current draft</p>');
    const b = fork(a);
    const before = readBlocks(blocksOf(a))[0]!.id;

    resetYDocFromHtml(a, '<p>The version being restored</p>');
    exchange(a, b);

    check(ydocToHtml(b) === '<p>The version being restored</p>' || ydocToHtml(b) === 'The version being restored', 'the other window gets the restored body');
    check(readBlocks(blocksOf(b))[0]!.id !== before, 'as new blocks, so nothing tries to merge into the old text');
    check(blocksOf(b).length === 1, 'and the old body is gone, not appended to');
  }

  // ── Whole-page behaviour ──────────────────────────────────────────────────
  group('page-level');
  {
    const page = [
      '<h2>Checkout rework</h2>',
      '<p>Users <b>abandon</b> at the address step.</p>',
      '<ul class="rte-check"><li data-checked="true">Measure it</li></ul>',
      '<figure class="mermaid-block"><pre class="mermaid-source"><code>graph TD\nA--&gt;B</code></pre></figure>',
      '<table><thead><tr><th scope="col">Step</th></tr></thead><tbody><tr><td>Address</td></tr></tbody></table>',
    ].join('');

    const once = throughYjs(page);
    // Idempotence is what makes the mirror safe to run on every debounce: the
    // second save of an unchanged page must not rewrite its markup, or the byline
    // would move and version history would fill with phantom edits.
    check(once === throughYjs(once), 'a second pass changes nothing (the conversion is idempotent)');
    check(once.includes('rte-check') && once.includes('mermaid-block'), 'a mixed page keeps every shape');

    const doc = new Y.Doc();
    seedYDocFromHtml(doc, page);
    check(blocksOf(doc).length === 5, 'seeding fills the block list');
    check(ydocToHtml(doc) === ydocToHtml(doc), 'two renders of one Y.Doc agree');
  }

  group('empty page');
  {
    const empty = new Y.Doc();
    seedYDocFromHtml(empty, '');
    check(blocksOf(empty).length === 0, 'empty HTML seeds nothing at all');
    check(convertHtml('').html === '', 'and converts to an empty string');
    check(ydocToHtml(empty) === '', 'an unfilled document renders as nothing (the mirror skips it)');
  }

  group('plain text (a page written before the editor existed)');
  {
    check(convertHtml('Just a sentence.').html === 'Just a sentence.', 'a one-line value stays bare');
    check(
      blocksToHtml([{ type: 'paragraph', data: { text: 'x' } }] as HtmlEditorBlock[]) === 'x',
      'and a single paragraph renders without a <p> wrapper',
    );
  }

  console.log(
    failures === 0
      ? `\nOK — ${checks} checks hold across every stored shape, and the document converges`
      : `\nFAILED — ${failures} of ${checks} checks`,
  );
  if (failures > 0) process.exit(1);
}

main();

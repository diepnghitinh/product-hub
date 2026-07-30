/**
 * Fidelity test for the conversion layer — the fragile half of this service.
 *
 *   npm run smoke
 *
 * Needs no database and no network. It proves the round trip the mirror depends
 * on, shape by shape: a page's stored HTML seeds a Y.Doc, and that Y.Doc renders
 * back to HTML the rest of the app can read.
 *
 * Every case here is a shape that measurably broke when BlockNote's own HTML
 * importer/exporter was used instead of `docHtml.ts` — a mermaid diagram became
 * a dead code block, checklist ticks were thrown away, a table lost its header
 * semantics, an image lost its width. So this file is not "does it still work",
 * it is the list of things that go wrong the moment the converter is bypassed.
 */
import * as Y from 'yjs';
import { convertHtml, seedYDocFromHtml, ydocToHtml } from '../src/blocknote.js';
import { DOC_FRAGMENT } from '../src/constants.js';
// Straight at the renderer, for the blocks that have no HTML to be seeded from.
import { blocksToHtml } from '../src/docHtml.js';

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
 * converters. That matters: the Y.Doc is where a block's props have to survive,
 * and a prop the schema doesn't know is dropped there rather than in the parser.
 */
async function throughYjs(html: string): Promise<string> {
  const doc = new Y.Doc();
  await seedYDocFromHtml(doc, html);
  return ydocToHtml(doc);
}

async function main(): Promise<void> {
  // ── Prose and marks ───────────────────────────────────────────────────────
  group('prose');
  {
    const out = await throughYjs(
      '<p>Users <b>abandon</b> at the <i>address</i> step, <u>twice</u>, <s>maybe</s> <code>POST /pay</code>.</p>',
    );
    check(out.includes('<b>abandon</b>'), 'bold stays <b>, not <strong>');
    check(out.includes('<i>address</i>'), 'italic stays <i>, not <em>');
    check(out.includes('<u>twice</u>'), 'underline survives');
    check(out.includes('<s>maybe</s>'), 'strikethrough survives');
    check(out.includes('<code>POST /pay</code>'), 'inline code survives');
    check(!out.includes('bn-'), 'no BlockNote class names leak into stored content');
    check(!out.includes('data-level'), 'no BlockNote data attributes leak');
  }

  group('headings h1..h6');
  {
    const out = await throughYjs('<h1>One</h1><h3>Three</h3><h6>Six</h6>');
    check(/<h1>One<\/h1>/.test(out), 'h1 round-trips');
    check(/<h3>Three<\/h3>/.test(out), 'h3 keeps its level');
    check(/<h6>Six<\/h6>/.test(out), 'h6 keeps its level');
  }

  group('links');
  {
    const out = await throughYjs('<p>See <a href="https://example.com/x?a=1&amp;b=2">the spec</a>.</p>');
    check(out.includes('href="https://example.com/x?a=1&amp;b=2"'), 'href survives with its entities');
    check(out.includes('>the spec</a>'), 'link text survives');
    check(!out.includes('classname'), "no lowercase 'classname' attribute (a BlockNote export bug)");
    check(!out.includes('nofollow'), 'no rel injected into stored content');
  }

  // ── Lists ─────────────────────────────────────────────────────────────────
  group('lists');
  {
    const out = await throughYjs(
      '<ul><li>One-page form</li><li>Remember address<ul><li>per user</li></ul></li></ul><ol><li>First</li><li>Second</li></ol>',
    );
    check(out.includes('<li>One-page form</li>'), 'a list item is <li>text</li>, with no <p> wrapper');
    check(out.includes('<ul><li>per user</li></ul></li>'), 'nested list stays nested inside its item');
    check(/<ol><li>First<\/li><li>Second<\/li><\/ol>/.test(out), 'ordered list is one <ol>, not two');
    check((out.match(/<ul>/g) ?? []).length === 2, 'sibling bullets group into one list');
  }

  group('checklist — ticks are data, not decoration');
  {
    const stored =
      '<ul class="rte-check"><li data-checked="true">Ship it</li><li data-checked="false">Write it up</li></ul>';
    const out = await throughYjs(stored);
    check(out.includes('class="rte-check"'), 'the rte-check class survives (the read view styles on it)');
    check(out.includes('data-checked="true">Ship it'), 'a ticked item stays ticked');
    check(out.includes('data-checked="false">Write it up'), 'an unticked item stays unticked');
  }

  // ── Blocks with no BlockNote equivalent ──────────────────────────────────
  group('mermaid — a diagram, not a code block');
  {
    const stored =
      '<figure class="mermaid-block"><pre class="mermaid-source"><code>graph TD\nA--&gt;B\nB--&gt;C</code></pre></figure>';
    const out = await throughYjs(stored);
    check(out.includes('class="mermaid-block"'), 'the figure marker survives, so the diagram still draws');
    check(out.includes('class="mermaid-source"'), 'the source marker survives');
    check(out.includes('A--&gt;B'), "the arrow stays escaped exactly once ('-->' is the diagram)");
    check(!out.includes('--&amp;gt;'), 'the arrow did not gain a second layer of escaping');
    const { blocks } = convertHtml(stored);
    check(
      blocks[0]?.type === 'codeBlock' && blocks[0]?.props?.['language'] === 'mermaid',
      'stored as a code block with language=mermaid — no custom schema needed',
    );
  }

  group('toggle');
  {
    const stored =
      '<details class="rte-toggle"><summary>Why not Editor.js?</summary><div class="rte-toggle__body"><p>No CRDT.</p><ul><li>and no cursors</li></ul></div></details>';
    const out = await throughYjs(stored);
    check(out.includes('<details class="rte-toggle">'), 'a toggle is still <details> a reader can unfold');
    check(out.includes('<summary>Why not Editor.js?</summary>'), 'the headline survives');
    check(out.includes('class="rte-toggle__body"'), 'the body keeps its wrapper');
    check(out.includes('<p>No CRDT.</p>'), 'body prose survives');
    check(out.includes('<li>and no cursors</li>'), 'a list inside a toggle survives');
    check(!/<ul><li><details/.test(out), 'not wrapped in a <ul> the way BlockNote exports it');
  }

  group('code and divider');
  {
    const out = await throughYjs('<pre><code>if (a &gt; 0) {\n  ship();\n}</code></pre><hr>');
    check(out.includes('<pre><code>'), 'a code block is still <pre><code>');
    check(out.includes('if (a &gt; 0)'), 'the comparison stays escaped once');
    check(out.includes('\n  ship();'), 'indentation and newlines survive');
    check(out.includes('<hr>'), 'a divider survives');
    // Every stored code block predates any notion of a language, so a bare one
    // has to stay bare — otherwise the first collaborative save would put a
    // `language-text` class on all of them.
    check(!out.includes('language-'), 'a code block with no language stays bare');
  }

  group('code — a chosen language');
  {
    // Nothing in the corpus has one, but BlockNote's code block has a language
    // picker, so the new editor can create this and it has to survive a save.
    const out = await throughYjs('<pre><code class="language-ts">const a = 1;</code></pre>');
    check(out.includes('class="language-ts"'), 'the language survives the round trip');
    check(out.includes('const a = 1;'), 'along with the code');
    check(!out.includes('mermaid'), 'and it is not mistaken for a diagram');
  }

  group('quote');
  {
    const out = await throughYjs('<blockquote>When buying a gift, help me pay fast.</blockquote>');
    check(
      out === '<blockquote>When buying a gift, help me pay fast.</blockquote>',
      'a blockquote round-trips byte for byte',
    );
  }

  // ── Tables ────────────────────────────────────────────────────────────────
  group('table — header semantics are accessibility, not styling');
  {
    const stored =
      '<table><thead><tr><th scope="col">Step</th><th scope="col">Drop-off</th></tr></thead><tbody><tr><th scope="row">Address</th><td>38%</td></tr></tbody></table>';
    const out = await throughYjs(stored);
    check(out.includes('<thead>'), 'the header row is still in a <thead>');
    check(out.includes('<th scope="col">Step</th>'), 'a header row cell is <th scope="col">');
    check(out.includes('<th scope="row">Address</th>'), 'a header column cell is <th scope="row">');
    check(out.includes('<td>38%</td>'), 'body cells stay <td>');
    check(!out.includes('<p>'), 'cells hold text, not a wrapped paragraph');
  }

  group('table — no headers');
  {
    const out = await throughYjs('<table><tr><td>a</td><td>b</td></tr></table>');
    check(!out.includes('<th'), 'a plain table gains no header cells');
    check(!out.includes('<thead'), 'and no thead');
  }

  group('table — dragged column widths');
  {
    const stored =
      '<table style="table-layout:fixed;width:100%"><colgroup><col style="width:25%"><col style="width:75%"></colgroup><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
    const out = await throughYjs(stored);
    check(out.includes('<colgroup>'), 'widths come back as a colgroup');
    check(out.includes('table-layout:fixed'), 'fixed layout stays inline so read views honour it');
    // Read the widths out of the colgroup alone — the table's own
    // `style="…width:100%"` is not a column width.
    const colgroup = out.match(/<colgroup>.*?<\/colgroup>/s)?.[0] ?? '';
    const pct = [...colgroup.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
    check(pct.length === 2, 'both columns get a width');
    check(
      pct.length === 2 && Math.abs(pct[0]! - 25) < 1 && Math.abs(pct[1]! - 75) < 1,
      `the 25/75 split survives the px round trip (got ${pct.join('/')})`,
    );
  }

  group('table — one column dragged, the rest left alone');
  {
    // What dragging a single border in the editor actually produces. Demanding a
    // width for *every* column dropped the whole colgroup, so the drag was gone
    // from the read view, the PDF and the public page.
    const one = blocksToHtml([
      {
        id: '1',
        type: 'table',
        content: {
          type: 'tableContent',
          columnWidths: [200, undefined],
          rows: [
            {
              cells: [
                { type: 'tableCell', content: [{ type: 'text', text: 'a' }], props: {} },
                { type: 'tableCell', content: [{ type: 'text', text: 'b' }], props: {} },
              ],
            },
          ],
        },
      },
    ] as never);
    check(one.includes('<colgroup>'), 'the width that was set is written out');
    check(one.includes('<col>'), 'and the untouched column goes out as auto');
    const pct = [...one.matchAll(/<col style="width:([\d.]+)%">/g)].map((m) => Number(m[1]));
    check(pct.length === 1 && pct[0]! > 20, `only the dragged column carries a width (${pct.join('/')})`);

    const back = await throughYjs(one);
    check(
      back.includes('<colgroup>') && back.includes('<col>'),
      'and a partial colgroup survives being read back in',
    );
    check(
      [...back.matchAll(/<col style="width:([\d.]+)%">/g)].length === 1,
      'without the auto column inventing a width',
    );
  }

  group('table — an image in a cell degrades to a link');
  {
    // The one place the converter cannot be faithful: `TableCell.content` is
    // `InlineContent[]`, so no schema change would let a picture live in a cell.
    // What it must not do is drop the file silently.
    const stored =
      '<table><tbody><tr><td>Screenshot</td><td><img src="/uploads/cell.png" alt="Cell image"></td></tr></tbody></table>';
    const out = await throughYjs(stored);
    check(out.includes('/uploads/cell.png'), 'the image url is still on the page');
    check(
      out.includes('<a href="/uploads/cell.png">Cell image</a>'),
      'it became a link labelled with its alt text',
    );
    check(!out.includes('<img'), 'and is no longer an <img>, which a cell cannot hold');

    const again = await throughYjs(out);
    check(again === out, 'the degraded form is stable — it degrades once, not every save');
  }

  // ── Media ─────────────────────────────────────────────────────────────────
  group('image');
  {
    const out = await throughYjs(
      '<figure><img src="/uploads/a.png" alt="Checkout" style="width:70%"><figcaption>The address step</figcaption></figure>',
    );
    check(out.includes('src="/uploads/a.png"'), 'the url survives');
    check(out.includes('<figcaption>The address step</figcaption>'), 'the caption survives');
    // 70% of the 704px page column. Percent has nowhere to live in BlockNote's
    // image block, so it is resolved once — see PAGE_COLUMN_PX in docHtml.ts.
    check(/style="width:49[0-9]px"/.test(out), `a 70% width resolves to ~493px (got: ${out.match(/width:[^"]*/)?.[0]})`);
  }

  group('image — bare, no caption');
  {
    const out = await throughYjs('<p>before</p><img src="/uploads/b.png" alt="Just alt">');
    check(out.includes('alt="Just alt"'), 'alt text survives when there is no caption');
    check(!out.includes('<figcaption'), 'no empty figcaption is invented');
    check(!out.includes('data-url'), 'no BlockNote data attributes on the image');
  }

  group('video');
  {
    const out = await throughYjs('<video src="/uploads/c.mp4" controls></video>');
    check(out.includes('src="/uploads/c.mp4"'), 'the url survives');
    check(out.includes('controls'), 'controls survive — without them it cannot be played');
  }

  /*
   * ── Blocks the editor can make that HTML cannot express ──────────────────
   *
   * Everything above starts from stored HTML, which is the right way to test a
   * shape that already exists in the database. These three don't exist there yet
   * and can't: nesting, audio and attachments have no Editor.js spelling, so the
   * only way to get one is to make it in the collaborative editor — Tab-indent a
   * line, or drop a file on the page.
   *
   * They are tested from blocks for that reason, and they are tested at all
   * because each one used to be dropped on the way out: children were rendered
   * only by lists and toggles, and audio/file fell through to an empty `<p>`. A
   * writer saw their content in the editor and readers didn't get it.
   */
  group('blocks with no HTML spelling');
  {
    const nested = blocksToHtml([
      { id: '1', type: 'paragraph', content: [{ type: 'text', text: 'Parent line' }] },
      {
        id: '2',
        type: 'paragraph',
        content: [{ type: 'text', text: 'Indented under it' }],
        children: [
          { id: '3', type: 'bulletListItem', content: [{ type: 'text', text: 'and a bullet' }] },
        ],
      },
    ]);
    check(nested.includes('Indented under it'), 'a Tab-indented line is in the stored HTML');
    check(nested.includes('<ul><li>and a bullet</li></ul>'), 'and its children keep their shape');

    const toggleHeading = blocksToHtml([
      {
        id: '1',
        type: 'heading',
        props: { level: 2, isToggleable: true },
        content: [{ type: 'text', text: 'Open questions' }],
        children: [{ id: '2', type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] }],
      },
    ]);
    check(toggleHeading.includes('<h2>Open questions</h2>'), 'a toggle heading is a heading');
    check(toggleHeading.includes('Body text'), "and a reader still gets what's folded inside it");

    const audio = blocksToHtml([
      { id: '1', type: 'audio', props: { url: '/uploads/call.mp3', name: 'call.mp3' } },
    ]);
    check(audio.includes('<audio src="/uploads/call.mp3" controls>'), 'audio is playable, not empty');

    const file = blocksToHtml([
      { id: '1', type: 'file', props: { url: '/uploads/spec.pdf', name: 'spec.pdf' } },
    ]);
    check(
      file.includes('href="/uploads/spec.pdf"') && file.includes('>spec.pdf<'),
      'an attachment is a link labelled with its name',
    );
  }

  // ── Whole-page behaviour ─────────────────────────────────────────────────
  group('page-level');
  {
    const page = [
      '<h2>Checkout rework</h2>',
      '<p>Users <b>abandon</b> at the address step.</p>',
      '<ul class="rte-check"><li data-checked="true">Measure it</li></ul>',
      '<figure class="mermaid-block"><pre class="mermaid-source"><code>graph TD\nA--&gt;B</code></pre></figure>',
      '<table><thead><tr><th scope="col">Step</th></tr></thead><tbody><tr><td>Address</td></tr></tbody></table>',
    ].join('');

    const once = await throughYjs(page);
    // Idempotence is what makes the mirror safe to run on every debounce: the
    // second save of an unchanged page must not rewrite its markup, or the
    // byline would move and version history would fill with phantom edits.
    const twice = await throughYjs(once);
    check(once === twice, 'a second pass changes nothing (the conversion is idempotent)');
    check(once.includes('rte-check') && once.includes('mermaid-block'), 'a mixed page keeps every shape');

    const doc = new Y.Doc();
    await seedYDocFromHtml(doc, page);
    check(doc.getXmlFragment(DOC_FRAGMENT).length > 0, 'seeding fills the fragment');
    const first = await ydocToHtml(doc);
    const second = await ydocToHtml(doc);
    check(first === second, 'two renders of one Y.Doc agree');
  }

  group('empty page');
  {
    const empty = new Y.Doc();
    await seedYDocFromHtml(empty, '');
    check(empty.getXmlFragment(DOC_FRAGMENT).length === 0, 'empty HTML seeds nothing at all');
    check(convertHtml('').html === '', 'and converts to an empty string');
  }

  group('plain text (a page written before the editor existed)');
  {
    const out = convertHtml('Just a sentence.').html;
    check(out === 'Just a sentence.', 'a one-line value stays bare, with no <p> wrapper');
  }

  console.log(
    failures === 0
      ? `\nOK — ${checks} fidelity checks hold across every stored shape`
      : `\nFAILED — ${failures} of ${checks} checks`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

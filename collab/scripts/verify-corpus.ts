/**
 * Runs every doc page that actually exists through the converter.
 *
 *   npm run corpus
 *
 * READ-ONLY. It never writes to the database — it answers one question about the
 * real corpus rather than a synthetic one: if collaborative editing were switched
 * on for every page tomorrow, what would change?
 *
 * `smoke` proves the shapes we thought of. This proves the pages we have. The
 * two catch different things: a class name that drifted, a markup shape nobody
 * documented, an old page written by a tool that no longer exists.
 */
import { JSDOM } from 'jsdom';
import { convertHtml } from '../src/ydoc.js';
import { closeMongo, connectMongo, pages, type PageRow } from '../src/mongo.js';

/**
 * Visible text, whitespace collapsed — the thing a reader would notice losing.
 *
 * Read out of a real DOM rather than by stripping tags, so entities decode the
 * way a browser decodes them and a stray `<` in a code block can't fake a match.
 *
 * Nothing is allowed for: the converter here is the app's own — the same one
 * every issue description has always saved through — so a page must come out
 * exactly as it went in. (The BlockNote build needed an allowance: its table
 * cells held inline content only, so an image in a cell degraded to a link.)
 */
function text(html: string): string {
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const LINK = /<a\s/g;

/** The markers that carry meaning the read view, PDF and public page act on. */
const MARKERS: Record<string, RegExp> = {
  'mermaid diagram': /class="mermaid-block"/g,
  'checklist': /class="rte-check"/g,
  'ticked item': /data-checked="true"/g,
  'toggle': /class="rte-toggle"/g,
  'table': /<table/g,
  'header cell': /<th[\s>]/g,
  'image': /<img[\s>]/g,
  'caption': /<figcaption>/g,
  'video': /<video[\s>]/g,
  'code block': /<pre>/g,
  'heading': /<h[1-6][\s>]/g,
  'list item': /<li[\s>]/g,
  'blockquote': /<blockquote[\s>]/g,
  'divider': /<hr\b/g,
  'link': LINK,
};

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

/** First point at which two strings diverge, with a little context each side. */
function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const from = Math.max(0, i - 40);
  return `…${a.slice(from, i + 60)}\n  became …${b.slice(from, i + 60)}`;
}

interface Problem {
  page: string;
  detail: string;
}

async function main(): Promise<void> {
  const db = await connectMongo();
  const problems: Problem[] = [];
  const notes: Problem[] = [];
  let examined = 0;

  try {
    // `title` isn't in `PageRow` — the service has no use for it. It's here only
    // to make a failure readable, so it's asked for locally rather than added
    // to the shared type.
    const all = (await pages(db)
      .find(
        { content: { $exists: true, $ne: '' } },
        { projection: { title: 1, content: 1, docId: 1 } },
      )
      .toArray()) as Array<PageRow & { title?: string }>;

    for (const page of all) {
      const stored = page.content ?? '';
      if (!stored.trim()) continue;
      examined += 1;
      const label = `${String(page.title ?? '').slice(0, 32) || '(untitled)'} [${String(page._id).slice(0, 8)}]`;

      let mirrored: string;
      try {
        mirrored = convertHtml(stored).html;
      } catch (error) {
        problems.push({ page: label, detail: `threw: ${(error as Error).message}` });
        continue;
      }

      // 1. No word may go missing. This is the one that would be a data loss.
      const before = text(stored);
      const after = text(mirrored);
      if (before !== after) {
        problems.push({
          page: label,
          detail: `text changed\n  was ${firstDifference(before, after)}`,
        });
      }

      // 2. No marker may go missing. Gaining one is fine — writing `<thead>`
      //    where the old renderer wrote a bare row is an improvement, not a loss.
      for (const [name, re] of Object.entries(MARKERS)) {
        const was = count(stored, re);
        const now = count(mirrored, re);
        if (now < was) problems.push({ page: label, detail: `lost ${was - now} × ${name}` });
      }

      // 3. Idempotence: the mirror runs on every save, so a page must reach a
      //    fixed point. Without it every debounce would rewrite the markup and
      //    move the byline on a page nobody edited.
      const twice = convertHtml(mirrored).html;
      if (twice !== mirrored) {
        problems.push({
          page: label,
          detail: `not idempotent\n  ${firstDifference(mirrored, twice)}`,
        });
      }

      // 4. Deliberate, documented changes — reported so they are never a surprise.
      //    Only one is left, and only pages touched during the short-lived
      //    BlockNote build can have it: Editor.js's code block has no language.
      const languages = count(stored, /<code class="language-/g);
      if (languages > 0) {
        notes.push({ page: label, detail: `${languages} × code language dropped (no such field in the editor)` });
      }
    }
  } finally {
    await closeMongo();
  }

  console.log(`examined ${examined} non-empty page(s)\n`);

  if (notes.length) {
    console.log('expected changes (documented, not losses):');
    for (const n of notes) console.log(`  · ${n.page}: ${n.detail}`);
    console.log('');
  }

  if (problems.length) {
    console.log(`PROBLEMS — ${problems.length}:`);
    for (const p of problems) console.log(`  ✗ ${p.page}: ${p.detail}`);
    process.exit(1);
  }

  console.log('OK — every stored page survives the round trip with its text and its shapes');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

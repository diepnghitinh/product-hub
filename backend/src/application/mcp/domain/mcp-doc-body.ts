/**
 * Turning what an assistant wrote into a doc page body.
 *
 * A page stores HTML — that is what the editor parses back into blocks and what
 * the reader renders. Assistants write Markdown by reflex, though, and Markdown
 * saved verbatim renders as literal `## ` and `- ` on the page forever, which is
 * a broken doc rather than a slightly plain one.
 *
 * So HTML passes straight through, and anything else is read as Markdown and
 * converted to the tag subset the editor understands. Deliberately small: this
 * is a safety net for a body that ignored the tool's "HTML" hint, not a Markdown
 * engine — anything it doesn't recognise simply stays as paragraph text.
 *
 * The one place it does more than translate is ```mermaid, which becomes a
 * diagram block rather than a listing of diagram syntax.
 */

/** Any block-level tag means the caller sent HTML and meant it. */
const BLOCK_HTML = /<(p|h[1-6]|ul|ol|li|pre|table|blockquote|figure|img|div|br)\b/i;

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```(\w*)/;
/** A thematic break: `---`, `***` or `___` alone on its line. Checked before
 *  BULLET, which needs whitespace after its marker and so never matches these. */
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
/** A row of a Markdown table: `| a | b |`. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** Whole fenced blocks, used to keep their contents out of prose-level checks. */
const FENCED_BLOCK = /```[\s\S]*?```/g;

/** Marks a stashed code span. A NUL can't occur in prose, so it can't collide. */
const SENTINEL = '\u0000';
const RESTORE_SPAN = /\u0000(\d+)\u0000/g;

/** A body that is HTML already, or Markdown rendered into the editor's tags. */
export function docBodyToHtml(body: string | undefined): string {
  const value = (body ?? '').trim();
  if (!value) return '';
  // Fenced blocks are content, not markup: mermaid labels wrap lines with
  // `<br/>`, and reading that as "this body is HTML" would store the whole
  // document as literal Markdown text.
  if (BLOCK_HTML.test(value.replace(FENCED_BLOCK, ''))) return promoteMermaid(value);
  return renderMarkdown(value);
}

/**
 * Drop an opening heading that only repeats the doc title.
 *
 * The page already prints its title above the body, and an assistant asked for
 * a document called X reliably starts writing with "# X" — leaving both makes
 * the title appear twice on nearly every doc. Only an exact match goes, so a
 * body that opens on a heading of its own keeps it.
 */
export function stripEchoedTitle(html: string, title: string): string {
  const opening = html.match(/^\s*<h([12])>([\s\S]*?)<\/h\1>/i);
  if (!opening) return html;
  const heading = unescapeHtml(opening[2].replace(/<[^>]+>/g, '')).trim().toLowerCase();
  if (heading !== title.trim().toLowerCase()) return html;
  return html.slice(opening[0].length).trim();
}

/* ── Diagrams ─────────────────────────────────────────────────────────────
   A mermaid diagram is stored as its *source* inside a marked figure, and the
   picture is drawn from that source wherever the page is displayed. The two
   class names are the whole contract: they are how the editor tells a diagram
   from a code block, so they must match `renderBlock`'s mermaid case in
   `frontend/src/lib/editorjs.ts`. Get them wrong and the diagram still saves —
   it just comes back as code that never draws. */
const MERMAID_BLOCK_CLASS = 'mermaid-block';
const MERMAID_SOURCE_CLASS = 'mermaid-source';

const mermaidFigure = (source: string): string =>
  `<figure class="${MERMAID_BLOCK_CLASS}"><pre class="${MERMAID_SOURCE_CLASS}"><code>${escapeHtml(
    source.trim(),
  )}</code></pre></figure>`;

/** A `<pre>`, with the attributes of it and of any `<code>` it wraps. */
const HTML_PRE = /<pre\b([^>]*)>\s*(?:<code\b([^>]*)>)?([\s\S]*?)(?:<\/code>\s*)?<\/pre>/gi;
/** `class="mermaid"` (mermaid's own convention) or `class="language-mermaid"`. */
const NAMES_MERMAID = /class\s*=\s*["'][^"']*\bmermaid\b/i;
const ALREADY_A_DIAGRAM = new RegExp(`\\b${MERMAID_SOURCE_CLASS}\\b`, 'i');

/**
 * Rewrite a diagram an HTML body carried as a code block into the figure the
 * editor reads as a diagram.
 *
 * The tool says HTML is stored as-is, so an assistant that writes a ```mermaid
 * fence and then renders its own Markdown hands over
 * `<pre><code class="language-mermaid">`. Left alone that is a code block
 * printing diagram syntax — correct text, no picture.
 */
function promoteMermaid(html: string): string {
  return html.replace(HTML_PRE, (whole, pre = '', code = '', body = '') => {
    const attrs = `${pre} ${code}`;
    if (ALREADY_A_DIAGRAM.test(attrs) || !NAMES_MERMAID.test(attrs)) return whole;
    return mermaidFigure(unescapeHtml(body.replace(/<[^>]+>/g, '')));
  });
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const unescapeHtml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Whether this line opens a block — and so ends the paragraph above it.
 *
 * `next` is needed because a table is only a table when a divider follows: a
 * lone piped line is prose. Every case here MUST have a matching branch in
 * {@link renderMarkdown}; a line reported as a block start with nothing to
 * consume it would leave the cursor parked and the loop spinning forever.
 */
const startsBlock = (line: string, next = ''): boolean =>
  HEADING.test(line) ||
  BULLET.test(line) ||
  NUMBERED.test(line) ||
  QUOTE.test(line) ||
  FENCE.test(line) ||
  RULE.test(line) ||
  startsTable(line, next);

const startsTable = (line: string, next: string): boolean =>
  TABLE_ROW.test(line) && !isDivider(line) && isDivider(next);

/** Cells of `| a | b |`, without the outer pipes. */
const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/**
 * The `|---|:--:|` line under a header row. A table only exists when this
 * follows a row — a lone piped line is prose ("use | to pipe"), not a table.
 */
const isDivider = (line: string): boolean =>
  TABLE_ROW.test(line) && cellsOf(line).every((c) => /^:?-+:?$/.test(c));

/**
 * A table, padded to the header's width. A short row gets empty cells rather
 * than a ragged `<tr>`, and a long one is truncated: a malformed row should
 * cost its own cells, not the shape of the whole table.
 */
function renderTable(header: string[], rows: string[][]): string {
  const head = header.map((c) => `<th>${inline(c)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${header.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Inline emphasis. Code spans are stashed first and put back last, so a `**` or
 * an underscore *inside* backticks stays the literal character it was typed as.
 * The placeholder is fenced with `SENTINEL`: a bare index would let "we shipped
 * 3 features" come back out as a code span.
 */
function inline(text: string): string {
  const spans: string[] = [];
  const stashed = escapeHtml(text).replace(/`([^`]+)`/g, (_, code: string) => {
    spans.push(code);
    return `${SENTINEL}${spans.length - 1}${SENTINEL}`;
  });
  const marked = stashed
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(^|\s)_([^_]+)_/g, '$1<i>$2</i>');
  return marked.replace(RESTORE_SPAN, (_, i: string) => `<code>${spans[Number(i)]}</code>`);
}

function renderMarkdown(body: string): string {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const language = fence[1].toLowerCase();
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      i++; // the closing fence, or the end of the body if it was never closed
      const source = code.join('\n');
      // ```mermaid is a picture, not a listing — that fence is how assistants
      // write a flowchart, and it's the only way one reaches the page.
      if (language === 'mermaid') {
        if (source.trim()) out.push(mermaidFigure(source));
      } else {
        out.push(`<pre>${escapeHtml(source)}</pre>`);
      }
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      // One list runs while its own marker keeps appearing — a bulleted list
      // followed by a numbered one is two lists, which is what was written.
      const ordered = !BULLET.test(line);
      const marker = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(marker);
        if (!item) break;
        items.push(`<li>${inline(item[1])}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    if (RULE.test(line)) {
      out.push('<hr/>');
      i++;
      continue;
    }

    // A table needs its divider on the very next line; without one this is just
    // a paragraph that happens to contain pipes.
    if (startsTable(line, lines[i + 1] ?? '')) {
      const header = cellsOf(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i]) && !isDivider(lines[i])) {
        rows.push(cellsOf(lines[i]));
        i++;
      }
      out.push(renderTable(header, rows));
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push((lines[i].match(QUOTE) as RegExpMatchArray)[1]);
        i++;
      }
      out.push(`<blockquote>${inline(quoted.join(' '))}</blockquote>`);
      continue;
    }

    // A paragraph runs to the next blank line or block marker; a single newline
    // inside it is a soft wrap, not a new paragraph.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1] ?? ''))
      para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return out.join('');
}

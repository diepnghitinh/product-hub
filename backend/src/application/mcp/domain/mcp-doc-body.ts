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
 */

/** Any block-level tag means the caller sent HTML and meant it. */
const BLOCK_HTML = /<(p|h[1-6]|ul|ol|li|pre|table|blockquote|figure|img|div|br)\b/i;

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;

/** Marks a stashed code span. A NUL can't occur in prose, so it can't collide. */
const SENTINEL = '\u0000';
const RESTORE_SPAN = /\u0000(\d+)\u0000/g;

/** A body that is HTML already, or Markdown rendered into the editor's tags. */
export function docBodyToHtml(body: string | undefined): string {
  const value = (body ?? '').trim();
  if (!value) return '';
  if (BLOCK_HTML.test(value)) return value;
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

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const unescapeHtml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const startsBlock = (line: string): boolean =>
  HEADING.test(line) ||
  BULLET.test(line) ||
  NUMBERED.test(line) ||
  QUOTE.test(line) ||
  FENCE.test(line);

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

    if (FENCE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      i++; // the closing fence, or the end of the body if it was never closed
      out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`);
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
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return out.join('');
}

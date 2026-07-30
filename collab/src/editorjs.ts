/* GENERATED FILE — do not edit here.
 *
 * Copied verbatim from frontend/src/lib/editorjs.ts by `npm run sync`.
 * Edit the source, run the script, commit both. `npm run typecheck` fails if
 * this copy and its source have drifted.
 */
// HTML ⇄ Editor.js block converters. The editor edits blocks, but we store plain
// HTML in the `description` string field — so existing plain-text descriptions
// round-trip as a single paragraph, and nothing else in the app has to change.
// Ported from old-report/lib/editorjs.ts.

// @editorjs/list v2 stores each item as an object with nested children, and the
// tick state of a checklist item under `meta`.
// Legacy data (and our HTML round-trip) may still produce plain strings.
export type ListItem =
  | string
  | { content?: string; items?: ListItem[]; meta?: { checked?: boolean } };

export type HtmlEditorBlock =
  | { type: 'paragraph'; data: { text: string } }
  | { type: 'header'; data: { text: string; level: number } }
  | {
      type: 'list';
      data: {
        style: 'ordered' | 'unordered' | 'checklist';
        items: ListItem[];
      };
    }
  | { type: 'code'; data: { code: string } }
  | { type: 'quote'; data: { text: string } }
  | {
      // A disclosure block: headline always visible, body folded away behind it.
      // Stored as `<details>`, so a read view opens it with no script of its own.
      type: 'toggle';
      data: { summary: string; text: string; open?: boolean };
    }
  | { type: 'divider'; data: Record<string, never> }
  | {
      // A Mermaid diagram. Only the source is stored — the picture is drawn at
      // render time, so a diagram stays editable text rather than a flat image.
      type: 'mermaid';
      data: { code: string };
    }
  | {
      type: 'table';
      data: {
        // Headers, stored as the semantics they are: `withHeadings` makes the
        // first row `<th scope="col">`, `withHeadingsColumn` makes the first cell
        // of every other row `<th scope="row">`. Independent — a table can have
        // either, both, or neither.
        withHeadings: boolean;
        withHeadingsColumn?: boolean;
        content: string[][];
        // Sizes set by dragging a column/row edge (`ResizableTableTool`), stored
        // as the markup a table already has for the job: `colWidths` become a
        // `<colgroup>` in %, `rowHeights` a `height:px` on each `<tr>`. Absent
        // on a table nobody has resized.
        colWidths?: number[];
        rowHeights?: number[];
      };
    }
  | {
      // @editorjs/image block. `file.url` is the stored file's URL (or a base64
      // data URL when no storage is configured).
      type: 'image';
      data: {
        // `width` is a CSS length (e.g. `"62%"`) set by the resize handle.
        file: { url: string; width?: string };
        caption?: string;
        withBorder?: boolean;
        withBackground?: boolean;
        stretched?: boolean;
      };
    }
  | {
      // Short-video block — `url` is the stored file's URL.
      type: 'video';
      data: { url: string };
    };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The inverse of `escapeHtml`, for text that has been through an HTML
 * round-trip and come back escaped.
 *
 * Editor.js sanitizes every string in a block's data before saving it, and that
 * sanitizer parses the value as HTML and re-serializes it — which turns a plain
 * `>` into `&gt;`. Harmless for prose, fatal for a mermaid diagram, whose arrows
 * *are* `-->`. Decoding here keeps stored diagram source escaped exactly once
 * instead of gaining a layer on every save.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Escape a string for use inside a double-quoted HTML attribute.
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Plain-text view of a caption (which may carry inline markup) for the `alt`.
function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

// Read a sanitized inline image width (`62%` or `320px`) off an element's style.
function parseImageWidth(el: Element): string {
  const w = (el as HTMLElement).style?.width?.trim() ?? '';
  return /^\d+(\.\d+)?(px|%)$/.test(w) ? w : '';
}

/** A positive CSS length as a bare number, or 0 when it isn't one. */
function parseLength(value: string | null | undefined, unit: '%' | 'px'): number {
  const m = new RegExp(`^(\\d+(?:\\.\\d+)?)${unit === '%' ? '%' : 'px'}$`).exec(
    (value ?? '').trim(),
  );
  return m ? Number(m[1]) : 0;
}

/** Marker classes that make a mermaid diagram recognisable in stored HTML. */
export const MERMAID_BLOCK_CLASS = 'mermaid-block';
export const MERMAID_SOURCE_CLASS = 'mermaid-source';

/**
 * A checklist is a `<ul>` wearing this class, its items ticked with
 * `data-checked`. Not a new convention: it's what the `/` menu inside a table
 * cell has always inserted, so a to-do written in a cell and one written as a
 * block are the same markup, painted by one CSS rule in both views.
 */
export const CHECK_LIST_CLASS = 'rte-check';
/** Wrapper + body classes for a toggle — see `ToggleTool`. */
export const TOGGLE_CLASS = 'rte-toggle';
export const TOGGLE_BODY_CLASS = 'rte-toggle__body';

const HEADER_TAG = /^h([1-6])$/;
const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'br',
  'cite',
  'code',
  'em',
  'i',
  'img',
  'kbd',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
]);

function isInlineTag(tag: string): boolean {
  return INLINE_TAGS.has(tag);
}

const isListTag = (el: Element): boolean => {
  const t = el.tagName.toLowerCase();
  return t === 'ul' || t === 'ol';
};

// Parse <li> children into @editorjs/list v2 items, splitting each item's
// inline content from any nested <ul>/<ol> so nesting survives the round trip.
// `meta` is always present, even when empty: the list tool reads `meta.checked`
// off every item of a checklist, and an item without one renders unticked and
// then throws away the tick on the next save.
function parseListItems(listEl: Element, checklist: boolean): ListItem[] {
  return Array.from(listEl.children)
    .filter((c) => c.tagName.toLowerCase() === 'li')
    .map((li) => {
      const items = Array.from(li.children)
        .filter(isListTag)
        .flatMap((nested) => parseListItems(nested, checklist));
      const clone = li.cloneNode(true) as Element;
      Array.from(clone.children)
        .filter(isListTag)
        .forEach((c) => clone.removeChild(c));
      return {
        content: clone.innerHTML.trim(),
        items,
        meta: checklist ? { checked: li.getAttribute('data-checked') === 'true' } : {},
      };
    });
}

/**
 * Hang an indent off the line above it, in place.
 *
 * Google Docs and Word write a nested list inside an `<li>` of its own with no
 * text on it. That empty item still draws a marker, and since it has no text the
 * marker shares its line with the child's — which is the `• ◦` a pasted outline
 * ends up reading as. There was never a line there: the indent belongs to the
 * item above it, so that is where it goes, and if there is nothing above it the
 * indent collapses into its own level rather than inventing a bullet to hang off.
 *
 * Run on the way into the editor and on the way into a read view, so a document
 * that was pasted like this reads properly before anyone re-saves it.
 */
export function foldListIndents(root: Element) {
  root.querySelectorAll('li').forEach((li) => {
    const nested = Array.from(li.children).filter(isListTag);
    if (!nested.length) return;
    const clone = li.cloneNode(true) as Element;
    Array.from(clone.children)
      .filter(isListTag)
      .forEach((c) => clone.removeChild(c));
    // Text, a picture, anything of its own — then it is an ordinary parent item
    // and the nesting under it is exactly what it looks like.
    if ((clone.textContent ?? '').replace(/\u00a0/g, '').trim() || clone.querySelector('img')) {
      return;
    }
    const previous = li.previousElementSibling;
    if (previous?.tagName === 'LI') {
      nested.forEach((list) => previous.appendChild(list));
      li.remove();
      return;
    }
    const parent = li.parentNode;
    if (!parent) return;
    nested.forEach((list) => {
      while (list.firstElementChild) parent.insertBefore(list.firstElementChild, li);
    });
    li.remove();
  });
}

/**
 * The URL of the first embedded image in a rich-text HTML value (`''` when there
 * is none). Used to derive a roadmap item's cover from its description — the
 * first picture in the write-up becomes the card cover. SSR-safe: falls back to
 * a regex when there's no DOMParser.
 */
export function firstImageUrl(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? '';
  }
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  return doc.querySelector('img')?.getAttribute('src') ?? '';
}

/**
 * The user ids of every `@` mention in a rich-text value, deduped. The chip the
 * mention menus insert carries the id, so the ids are read back off the saved
 * HTML at submit rather than tracked alongside it — nothing to keep in sync, and
 * deleting the chip deletes the mention.
 */
export function mentionIdsFromHtml(html: string): string[] {
  if (!html) return [];
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    const matched = [...html.matchAll(/data-user-id=["']([^"']+)["']/g)]
      .map((m) => m[1] ?? '')
      .filter(Boolean);
    return [...new Set(matched)];
  }
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  const ids = [...doc.querySelectorAll('[data-user-id]')]
    .map((el) => el.getAttribute('data-user-id') || '')
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * The visible text of a rich-text value — for "is this actually empty?" checks,
 * where `<p></p>` and `<br>` are markup, not content. Embeds contribute no text,
 * so a caller that counts an image as content looks for one separately.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ');
  }
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  // Chips insert a non-breaking space after themselves; it isn't content.
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ');
}

/** A tag the editor actually emits — not any `<` someone typed in a sentence. */
const RICH_TAG =
  /<(p|div|br|ul|ol|li|h[1-6]|pre|code|blockquote|table|span|b|strong|i|em|u|mark|a|hr|details|summary)\b[^>]*>/i;
/** `&amp;` / `&lt;` / `&#39;` — text that has been through an HTML escaper. */
const HTML_ENTITY = /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;

/**
 * Whether a stored value is rich text or plain text someone typed before the
 * surface had an editor. Comments predate their rich editor, so the read view has
 * to tell the two apart: HTML rendered as text shows its tags, and text rendered
 * as HTML loses its line breaks.
 *
 * Entities count as rich, because a single-paragraph value is stored without its
 * `<p>` wrapper (see `blocksToHtml`) — so "Tom & Jerry" typed into the editor is
 * stored as `Tom &amp; Jerry` with no tag in sight, and printing it as text would
 * show the reader the escape.
 */
export function isRichHtml(value: string): boolean {
  return RICH_TAG.test(value) || HTML_ENTITY.test(value);
}

/**
 * Turn pasted non-breaking spaces back into ordinary ones, in place.
 *
 * Word processors join words with `&nbsp;` — Google Docs does it throughout — and
 * to the browser a phrase held together by them is a single unbreakable word: it
 * overflows its container or gets chopped mid-word instead of wrapping, which is
 * how a pasted sentence in a narrow table cell ended up broken across
 * `experie/nce`. Runs over the live DOM after a paste and over stored HTML on the
 * way in, so a document that was already saved that way heals when it reloads.
 *
 * A leading one on a text node is left alone: that is the caret seed a fresh list
 * item or chip is holding on to (see `trimSeedPad`), and an ordinary space there
 * collapses to nothing. Code keeps every space it was given.
 */
export function normalizeSpaces(root: Element): boolean {
  const doc = root.ownerDocument;
  if (!doc || typeof NodeFilter === 'undefined') return false;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('pre, code, textarea')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);

  // The caret, as plain numbers. `replaceData` drags any live range that sits
  // inside what it rewrites back to the start of it — and a range saved by
  // cloning is live too, so the only safe snapshot is the node and the offset.
  const sel = doc.defaultView?.getSelection?.() ?? null;
  const caret =
    sel && sel.rangeCount
      ? { node: sel.getRangeAt(0).startContainer, offset: sel.getRangeAt(0).startOffset }
      : null;

  let changed = false;
  for (const text of texts) {
    if (!text.data.includes('\u00a0', 1)) continue;
    text.replaceData(1, text.data.length - 1, text.data.slice(1).replace(/\u00a0/g, ' '));
    changed = true;
  }
  // Every replacement is the same length as what it replaced, so the caret goes
  // back exactly where it was.
  if (changed && caret && sel && caret.node.isConnected) {
    const range = doc.createRange();
    try {
      range.setStart(caret.node, caret.offset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // The paste replaced the node the caret was in — the browser has already put
      // it somewhere sensible.
    }
  }
  return changed;
}

export function htmlToBlocks(html: string): HtmlEditorBlock[] {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html ? [{ type: 'paragraph', data: { text: html } }] : [];
  }
  if (!html) return [];

  const doc = new DOMParser().parseFromString(
    `<!doctype html><body><div id="__root">${html}</div></body>`,
    'text/html',
  );
  const root = doc.getElementById('__root');
  if (!root) return [];
  // Before anything is read off it: a document pasted out of a word processor
  // gets its spaces and its indents fixed on the way into the editor, so opening
  // it is the repair.
  normalizeSpaces(root);
  foldListIndents(root);

  const blocks: HtmlEditorBlock[] = [];
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.replace(/\s+$/, '').replace(/^\s+/, '');
    if (trimmed) {
      blocks.push({ type: 'paragraph', data: { text: buffer.trim() } });
    }
    buffer = '';
  };

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent ?? '';
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'p') {
      flush();
      blocks.push({ type: 'paragraph', data: { text: el.innerHTML } });
      continue;
    }
    const headerMatch = tag.match(HEADER_TAG);
    if (headerMatch) {
      flush();
      blocks.push({
        type: 'header',
        data: { text: el.innerHTML, level: Number(headerMatch[1]) },
      });
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      flush();
      const checklist = tag === 'ul' && el.classList.contains(CHECK_LIST_CLASS);
      blocks.push({
        type: 'list',
        data: {
          style: tag === 'ol' ? 'ordered' : checklist ? 'checklist' : 'unordered',
          items: parseListItems(el, checklist),
        },
      });
      continue;
    }
    if (tag === 'blockquote') {
      flush();
      blocks.push({ type: 'quote', data: { text: el.innerHTML.trim() } });
      continue;
    }
    if (tag === 'hr') {
      flush();
      blocks.push({ type: 'divider', data: {} });
      continue;
    }
    if (tag === 'details') {
      flush();
      // Everything that isn't the headline is the body — read from a clone, so a
      // page written before the body had its own wrapper still opens with its
      // content rather than losing it to an empty `<div>` lookup.
      const summary = el.querySelector('summary');
      const clone = el.cloneNode(true) as Element;
      clone.querySelector('summary')?.remove();
      const body = clone.querySelector(`.${TOGGLE_BODY_CLASS}`) ?? clone;
      blocks.push({
        type: 'toggle',
        data: {
          summary: summary?.innerHTML.trim() ?? '',
          text: body.innerHTML.trim(),
          open: el.hasAttribute('open'),
        },
      });
      continue;
    }
    if (tag === 'pre') {
      flush();
      // A mermaid block is a <pre> too — tell them apart by the marker class,
      // or the diagram comes back as a plain code block that never draws.
      const type = el.classList.contains(MERMAID_SOURCE_CLASS) ? 'mermaid' : 'code';
      blocks.push({ type, data: { code: el.textContent ?? '' } } as HtmlEditorBlock);
      continue;
    }
    if (tag === 'table') {
      flush();
      const rowEls = Array.from(el.querySelectorAll('tr'));
      const cellsOf = (tr: Element) =>
        Array.from(tr.children).filter((c) => {
          const t = c.tagName.toLowerCase();
          return t === 'td' || t === 'th';
        });
      const content = rowEls.map((tr) => cellsOf(tr).map((cell) => cell.innerHTML));
      // A header *row* means the whole first row is `th` — testing for "any `th`
      // in the first row" would read a header *column* as a header row too, since
      // that column's `th` is the first row's first cell.
      const firstRow = rowEls[0] ? cellsOf(rowEls[0]) : [];
      const hasTh =
        !!el.querySelector('thead th') ||
        (firstRow.length > 0 && firstRow.every((c) => c.tagName === 'TH'));
      // …and a header column means every *body* row starts with one. With no body
      // rows there's nothing to generalise from, so fall back to the explicit
      // `scope` — which is what this writes, and what hand-authored HTML uses.
      const bodyRows = hasTh ? rowEls.slice(1) : rowEls;
      const hasThColumn = bodyRows.length
        ? bodyRows.every((tr) => cellsOf(tr)[0]?.tagName === 'TH')
        : !!el.querySelector('th[scope="row"]');
      // Sizes come back off the `<colgroup>` and the rows' own heights. A
      // partial or hand-written colgroup is ignored rather than half-applied:
      // one missing width would mis-size every column after it.
      const colWidths = Array.from(el.querySelectorAll('col')).map((c) =>
        parseLength((c as HTMLElement).style?.width, '%'),
      );
      const rowHeights = rowEls.map((tr) => parseLength((tr as HTMLElement).style?.height, 'px'));
      blocks.push({
        type: 'table',
        data: {
          withHeadings: hasTh,
          ...(hasThColumn ? { withHeadingsColumn: true } : {}),
          content,
          ...(colWidths.length > 1 && colWidths.every((w) => w > 0) ? { colWidths } : {}),
          ...(rowHeights.some((h) => h > 0) ? { rowHeights } : {}),
        },
      });
      continue;
    }
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? '';
      if (src) {
        flush();
        const width = parseImageWidth(el);
        blocks.push({
          type: 'image',
          data: {
            file: width ? { url: src, width } : { url: src },
            caption: el.getAttribute('alt') ?? '',
            ...(el.classList.contains('img-bordered') ? { withBorder: true } : {}),
          },
        });
        continue;
      }
    }
    if (tag === 'figure') {
      // Checked before the image case: a diagram's <figure> holds no <img>, so
      // it would otherwise fall through and be flattened into a paragraph.
      if (el.classList.contains(MERMAID_BLOCK_CLASS)) {
        flush();
        blocks.push({ type: 'mermaid', data: { code: el.textContent ?? '' } });
        continue;
      }
      const img = el.querySelector('img');
      const src = img?.getAttribute('src') ?? '';
      if (img && src) {
        flush();
        const figcap = el.querySelector('figcaption');
        const width = parseImageWidth(img);
        blocks.push({
          type: 'image',
          data: {
            file: width ? { url: src, width } : { url: src },
            caption: figcap ? figcap.innerHTML.trim() : (img.getAttribute('alt') ?? ''),
            ...(img.classList.contains('img-bordered') ? { withBorder: true } : {}),
          },
        });
        continue;
      }
    }
    if (tag === 'video') {
      const src =
        el.getAttribute('src') || el.querySelector('source')?.getAttribute('src') || '';
      if (src) {
        flush();
        blocks.push({ type: 'video', data: { url: src } });
        continue;
      }
    }
    if (isInlineTag(tag)) {
      buffer += el.outerHTML;
      continue;
    }
    flush();
    blocks.push({ type: 'paragraph', data: { text: el.innerHTML } });
  }
  flush();
  return blocks;
}

function renderListItems(
  items: ListItem[] | undefined,
  tag: 'ol' | 'ul',
  checklist: boolean,
): string {
  const open = checklist ? `<ul class="${CHECK_LIST_CLASS}">` : `<${tag}>`;
  return (items ?? [])
    .map((item) => {
      // Legacy @editorjs/list v1 data stored items as plain strings.
      if (typeof item === 'string') return `<li>${item}</li>`;
      const content = item?.content ?? '';
      const children = Array.isArray(item?.items) ? item.items : [];
      const nested = children.length
        ? `${open}${renderListItems(children, tag, checklist)}</${tag}>`
        : '';
      // The tick rides on the item, where the CSS and the table's own checklist
      // both already look for it.
      const checked = checklist ? ` data-checked="${item?.meta?.checked ? 'true' : 'false'}"` : '';
      return `<li${checked}>${content}${nested}</li>`;
    })
    .join('');
}

function renderBlock(b: HtmlEditorBlock): string {
  if (b.type === 'header') {
    const level = Math.min(6, Math.max(1, b.data.level || 2));
    return `<h${level}>${b.data.text ?? ''}</h${level}>`;
  }
  if (b.type === 'list') {
    const checklist = b.data.style === 'checklist';
    const tag = b.data.style === 'ordered' ? 'ol' : 'ul';
    const open = checklist ? `<ul class="${CHECK_LIST_CLASS}">` : `<${tag}>`;
    return `${open}${renderListItems(b.data.items, tag, checklist)}</${tag}>`;
  }
  if (b.type === 'code') {
    return `<pre><code>${escapeHtml(b.data.code ?? '')}</code></pre>`;
  }
  if (b.type === 'quote') {
    const text = b.data.text ?? '';
    return text.trim() ? `<blockquote>${text}</blockquote>` : '';
  }
  if (b.type === 'divider') {
    return '<hr>';
  }
  if (b.type === 'toggle') {
    const summary = b.data.summary ?? '';
    const text = b.data.text ?? '';
    if (!summary.trim() && !text.trim()) return '';
    // `open` is the author's choice and is stored as the attribute the browser
    // reads, so a reader opens the page folded exactly as it was written.
    const open = b.data.open ? ' open' : '';
    return `<details class="${TOGGLE_CLASS}"${open}><summary>${summary}</summary><div class="${TOGGLE_BODY_CLASS}">${text}</div></details>`;
  }
  if (b.type === 'mermaid') {
    // Decoded first: the source arrives from Editor.js's sanitizer already
    // escaped, and escaping it again would store `--&amp;gt;` for `-->`.
    const code = decodeEntities(b.data.code ?? '').trim();
    if (!code) return '';
    // The source is the whole payload; the SVG is drawn from it wherever this
    // HTML is displayed, so the stored value stays small and stays editable.
    return `<figure class="${MERMAID_BLOCK_CLASS}"><pre class="${MERMAID_SOURCE_CLASS}"><code>${escapeHtml(code)}</code></pre></figure>`;
  }
  if (b.type === 'table') {
    const rows = b.data.content ?? [];
    if (rows.length === 0) return '';
    const withHeadings = !!b.data.withHeadings;
    const heights = b.data.rowHeights ?? [];
    // Dragged column widths ride along as a `<colgroup>`. `table-layout:fixed`
    // is inline rather than in a stylesheet so the widths hold everywhere the
    // stored HTML is painted — read views and public share pages included, with
    // nothing for them to opt into.
    const widths = b.data.colWidths ?? [];
    const cols = widths.length
      ? `<colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`
      : '';
    const open = widths.length
      ? '<table style="table-layout:fixed;width:100%">'
      : '<table>';
    // A header cell is written as a real `<th>` with a `scope`, not as a styled
    // `<td>`: it's what a screen reader needs to announce "Revenue, Q3" instead
    // of reading a grid of loose numbers, and it's what tells this same function's
    // reader half which header it was on the way back in.
    const headColumn = !!b.data.withHeadingsColumn;
    const renderRow = (cells: string[], useTh: boolean, index: number) => {
      const h = heights[index] ?? 0;
      const style = h > 0 ? ` style="height:${h}px"` : '';
      const cell = (c: string, col: number) => {
        // The corner cell belongs to the header row *and* the header column;
        // `scope="col"` wins, because that's the heading it labels.
        if (useTh) return `<th scope="col">${c ?? ''}</th>`;
        if (headColumn && col === 0) return `<th scope="row">${c ?? ''}</th>`;
        return `<td>${c ?? ''}</td>`;
      };
      return `<tr${style}>${cells.map(cell).join('')}</tr>`;
    };
    if (withHeadings) {
      const [head = [], ...body] = rows;
      const thead = `<thead>${renderRow(head, true, 0)}</thead>`;
      const tbody = body.length
        ? `<tbody>${body.map((r, i) => renderRow(r, false, i + 1)).join('')}</tbody>`
        : '';
      return `${open}${cols}${thead}${tbody}</table>`;
    }
    return `${open}${cols}<tbody>${rows.map((r, i) => renderRow(r, false, i)).join('')}</tbody></table>`;
  }
  if (b.type === 'image') {
    const url = b.data.file?.url ?? '';
    if (!url) return '';
    const caption = b.data.caption ?? '';
    const width = b.data.file?.width ?? '';
    const cls = b.data.withBorder ? ' class="img-bordered"' : '';
    const style = width ? ` style="width:${escapeAttr(width)}"` : '';
    const img = `<img src="${escapeAttr(url)}" alt="${escapeAttr(stripTags(caption))}"${cls}${style}>`;
    return caption ? `<figure>${img}<figcaption>${caption}</figcaption></figure>` : img;
  }
  if (b.type === 'video') {
    const url = b.data.url ?? '';
    return url ? `<video src="${escapeAttr(url)}" controls></video>` : '';
  }
  return `<p>${b.data.text ?? ''}</p>`;
}

export function blocksToHtml(blocks: HtmlEditorBlock[]): string {
  if (blocks.length === 0) return '';
  // A single paragraph is stored as bare inline HTML — the shape every value
  // written before the editor existed already has.
  const only = blocks.length === 1 ? blocks[0] : undefined;
  if (only?.type === 'paragraph') return only.data.text ?? '';
  return blocks.map(renderBlock).join('');
}

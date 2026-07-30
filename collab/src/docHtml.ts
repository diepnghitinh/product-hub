/**
 * Our stored HTML ⇄ BlockNote blocks.
 *
 * BlockNote ships its own HTML importer/exporter, and we deliberately use
 * neither. Its exporter emits BlockNote-flavoured markup — `class="bn-…"`,
 * `<li><p>text</p></li>`, `data-level`, a lowercase `classname` attribute on
 * links — and its importer throws away everything it has no block for. Measured
 * against real pages, letting it near our content destroyed mermaid diagrams,
 * checklist ticks, table header semantics and image widths.
 *
 * `docpages.content` is read by the read view, the PDF renderer, the print
 * service, public share links and the MCP text extractor. None of them load
 * BlockNote's stylesheet, and all of them predate it. So the stored shapes are
 * the contract and this file is the only thing that speaks both languages.
 *
 * The other half of the contract lives in `frontend/src/lib/editorjs.ts`, which
 * reads and writes the same markup for the surfaces still on Editor.js (issue
 * descriptions, comments, report sections). The two are pinned together by
 * `scripts/verify-corpus.ts`, which round-trips every real page in the database:
 * if a class name drifts on either side, that test fails.
 */

// ── The stored shapes ──────────────────────────────────────────────────────
// Names, not values: these strings are the interop surface with the read view's
// CSS and with `frontend/src/lib/editorjs.ts`. Changing one is a data migration.

/** A checklist is a `<ul>` wearing this class, ticks on `data-checked`. */
const CHECK_LIST_CLASS = 'rte-check';
/** A toggle is `<details>` + a wrapped body, so a reader unfolds it with no JS. */
const TOGGLE_CLASS = 'rte-toggle';
const TOGGLE_BODY_CLASS = 'rte-toggle__body';
/** A mermaid diagram stores its source; the picture is drawn at render time. */
const MERMAID_BLOCK_CLASS = 'mermaid-block';
const MERMAID_SOURCE_CLASS = 'mermaid-source';
/** An image the author asked for a border on. */
const IMAGE_BORDER_CLASS = 'img-bordered';

/**
 * The language that turns a code block into a diagram.
 *
 * Mermaid is a code block with a language, not a block type of its own — which
 * is what keeps this whole feature free of custom blocks. A custom block would
 * have to exist in the client's schema *and* in the server's, so the schema
 * would have to be shared across two packages with two Docker build contexts.
 * A language string needs none of that: `language` is a free-form prop on
 * BlockNote's default code block, so client and server already agree.
 */
export const MERMAID_LANGUAGE = 'mermaid';

/**
 * The page column, in px, that a percentage image width is resolved against.
 *
 * `max-w-3xl` (768px) less the `sm:px-8` gutters — see `widthClass` in
 * `frontend/src/features/docs/pageStyle.ts`. BlockNote's image block stores
 * `previewWidth` as a number of pixels and has nothing that can hold a
 * percentage, so a stored `width:70%` is resolved once, here, on the way in.
 * The conversion is one-way and approximate by nature: a page set to full width
 * gets a wider column than this, and the image no longer grows with it. It
 * stays inside the column either way — the read view caps images at
 * `max-width:100%`.
 */
const PAGE_COLUMN_PX = 704;

// ── BlockNote's block JSON, as much of it as we touch ─────────────────────
// Structural types rather than BlockNote's own generics: those are parameterised
// by the whole schema, and pinning them here would make this file need the
// editor instance it exists to stay independent of.

export interface Styles {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
}

export interface TextInline {
  type: 'text';
  text: string;
  styles: Styles;
}

export interface LinkInline {
  type: 'link';
  href: string;
  content: TextInline[];
}

export type Inline = TextInline | LinkInline;

export interface TableCell {
  type: 'tableCell';
  content: Inline[];
  props: {
    colspan: number;
    rowspan: number;
    backgroundColor: string;
    textColor: string;
    textAlignment: string;
  };
}

export interface TableContent {
  type: 'tableContent';
  columnWidths: (number | undefined)[];
  headerRows?: number;
  headerCols?: number;
  rows: { cells: TableCell[] }[];
}

export interface DocBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: Inline[] | TableContent;
  children?: DocBlock[];
}

// ── Text helpers ──────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Plain-text view of a caption (which may carry markup) for the `alt`. */
function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

/** A positive CSS length as a bare number, or 0 when it isn't one. */
function parseLength(value: string | null | undefined, unit: '%' | 'px'): number {
  const m = new RegExp(`^(\\d+(?:\\.\\d+)?)${unit === '%' ? '%' : 'px'}$`).exec(
    (value ?? '').trim(),
  );
  return m ? Number(m[1]) : 0;
}

/** A stored image width (`70%` or `320px`) as the px number BlockNote holds. */
function widthToPx(raw: string): number | undefined {
  const px = parseLength(raw, 'px');
  if (px > 0) return Math.round(px);
  const pct = parseLength(raw, '%');
  if (pct > 0) return Math.round((pct / 100) * PAGE_COLUMN_PX);
  return undefined;
}

// ── HTML → blocks ─────────────────────────────────────────────────────────

/** The mark each inline tag contributes. */
const STYLE_TAGS: Record<string, keyof Styles> = {
  b: 'bold',
  strong: 'bold',
  i: 'italic',
  em: 'italic',
  u: 'underline',
  s: 'strike',
  strike: 'strike',
  del: 'strike',
  code: 'code',
};

/**
 * Inline content of one element, as BlockNote's text/link runs.
 *
 * Runs are emitted as they are found rather than merged: BlockNote merges
 * adjacent runs with identical styles itself when the blocks are applied, and
 * merging here would only make this harder to read.
 */
function inlineFrom(el: Node, styles: Styles = {}): Inline[] {
  const out: Inline[] = [];

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const text = node.textContent ?? '';
      if (text) out.push({ type: 'text', text, styles: { ...styles } });
      continue;
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) continue;

    const child = node as Element;
    const tag = child.tagName.toLowerCase();

    // A hard break inside a paragraph. BlockNote holds it as a newline in the
    // run; the serializer turns it back into `<br>`.
    if (tag === 'br') {
      out.push({ type: 'text', text: '\n', styles: { ...styles } });
      continue;
    }

    // An image somewhere only inline content can go — overwhelmingly a table
    // cell, since the cell `/` menu can insert one. BlockNote's `TableCell.content`
    // is `InlineContent[]`, so a picture cannot live there at any price: not a
    // gap in this converter, a fact about the schema.
    //
    // So it degrades to a link to itself. The alternatives were worse: dropping
    // it loses the file, and hoisting it out of the table moves it somewhere the
    // author didn't put it. A link keeps the image one click away and survives
    // the round trip unchanged.
    if (tag === 'img') {
      const src = child.getAttribute('src') ?? '';
      const alt = child.getAttribute('alt')?.trim();
      if (src) {
        out.push({
          type: 'link',
          href: src,
          content: [{ type: 'text', text: alt || 'image', styles: { ...styles } }],
        });
      }
      continue;
    }

    if (tag === 'a') {
      const href = child.getAttribute('href') ?? '';
      // Links carry text only. A link wrapping an image is not something the
      // editor can make, and flattening it to its text loses less than dropping
      // the whole run would.
      const content = inlineFrom(child, styles).flatMap((run) =>
        run.type === 'text' ? [run] : run.content,
      );
      if (href && content.length) out.push({ type: 'link', href, content });
      else out.push(...content);
      continue;
    }

    const mark = STYLE_TAGS[tag];
    if (mark) {
      out.push(...inlineFrom(child, { ...styles, [mark]: true }));
      continue;
    }

    // `<mark>` is the highlight the editor's toolbar writes. BlockNote spells
    // the same thing as a background colour.
    if (tag === 'mark') {
      out.push(...inlineFrom(child, { ...styles, backgroundColor: 'yellow' }));
      continue;
    }

    if (tag === 'span') {
      const el2 = child as HTMLElement;
      const next = { ...styles };
      const color = el2.style?.color?.trim();
      const background = el2.style?.backgroundColor?.trim();
      if (color) next.textColor = color;
      if (background) next.backgroundColor = background;
      out.push(...inlineFrom(child, next));
      continue;
    }

    // Anything else contributes its text. Notably an `@` mention chip, which the
    // doc editor has never been able to insert (`RichTextEditor` gates it behind
    // a `mentions` prop the doc page doesn't pass) and which no stored page
    // contains — so it flattens to the name it displays rather than vanishing.
    out.push(...inlineFrom(child, styles));
  }

  return out;
}

const HEADER_TAG = /^h([1-6])$/;

const isListTag = (el: Element): boolean => {
  const t = el.tagName.toLowerCase();
  return t === 'ul' || t === 'ol';
};

/** `<li>` children as list blocks, nested lists becoming `children`. */
function listItemsFrom(listEl: Element, type: string, checklist: boolean): DocBlock[] {
  return Array.from(listEl.children)
    .filter((c) => c.tagName.toLowerCase() === 'li')
    .map((li) => {
      // The item's own text is everything that isn't a nested list.
      const nested = Array.from(li.children).filter(isListTag);
      const clone = li.cloneNode(true) as Element;
      Array.from(clone.children)
        .filter(isListTag)
        .forEach((c) => clone.removeChild(c));

      const children = nested.flatMap((sub) =>
        listItemsFrom(
          sub,
          sub.tagName.toLowerCase() === 'ol'
            ? 'numberedListItem'
            : sub.classList.contains(CHECK_LIST_CLASS)
              ? 'checkListItem'
              : 'bulletListItem',
          sub.classList.contains(CHECK_LIST_CLASS),
        ),
      );

      // A checklist item written before the tick had a home reads as unticked,
      // which is also what `data-checked="false"` means.
      const props = checklist
        ? { checked: li.getAttribute('data-checked') === 'true' }
        : undefined;

      return {
        type,
        ...(props ? { props } : {}),
        content: inlineFrom(clone),
        ...(children.length ? { children } : {}),
      } satisfies DocBlock;
    });
}

/** Cells of one row, `<td>` and `<th>` alike. */
function cellsOf(tr: Element): Element[] {
  return Array.from(tr.children).filter((c) => {
    const t = c.tagName.toLowerCase();
    return t === 'td' || t === 'th';
  });
}

function tableCell(cell: Element): TableCell {
  return {
    type: 'tableCell',
    content: inlineFrom(cell),
    props: {
      colspan: Number(cell.getAttribute('colspan')) || 1,
      rowspan: Number(cell.getAttribute('rowspan')) || 1,
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
  };
}

function tableFrom(el: Element): DocBlock {
  const rowEls = Array.from(el.querySelectorAll('tr'));

  // A header *row* means the whole first row is `th`. Testing for "any th in the
  // first row" would read a header *column* as a header row too, since that
  // column's first `th` is also the first row's first cell.
  const firstRow = rowEls[0] ? cellsOf(rowEls[0]) : [];
  const headerRow =
    !!el.querySelector('thead th') ||
    (firstRow.length > 0 && firstRow.every((c) => c.tagName === 'TH'));

  // …and a header column means every *body* row starts with one. With no body
  // rows there is nothing to generalise from, so fall back to the explicit
  // `scope`, which is what we write and what hand-authored HTML uses.
  const bodyRows = headerRow ? rowEls.slice(1) : rowEls;
  const headerCol = bodyRows.length
    ? bodyRows.every((tr) => cellsOf(tr)[0]?.tagName === 'TH')
    : !!el.querySelector('th[scope="row"]');

  const rows = rowEls.map((tr) => ({ cells: cellsOf(tr).map(tableCell) }));
  const columns = rows[0]?.cells.length ?? 0;

  // Widths come off the `<colgroup>`, in percent, and BlockNote holds pixels.
  // A `<col>` with no width stays `undefined` — that is BlockNote's own spelling
  // of "auto", and it is what someone who resized one column and left the rest
  // alone actually has. What is *not* usable is a colgroup of the wrong arity:
  // one `<col>` too few and every width after it lands on the wrong column.
  const pct = Array.from(el.querySelectorAll('col')).map((c) =>
    parseLength((c as HTMLElement).style?.width, '%'),
  );
  const usable = pct.length === columns;
  const columnWidths: (number | undefined)[] = usable
    ? pct.map((w) => (w > 0 ? Math.round((w / 100) * PAGE_COLUMN_PX) : undefined))
    : new Array<undefined>(columns).fill(undefined);

  return {
    type: 'table',
    props: { textColor: 'default' },
    content: {
      type: 'tableContent',
      columnWidths,
      ...(headerRow ? { headerRows: 1 } : {}),
      ...(headerCol ? { headerCols: 1 } : {}),
      rows,
    },
  };
}

function imageFrom(img: Element, caption: string): DocBlock {
  const alt = img.getAttribute('alt') ?? '';
  const width = widthToPx((img as HTMLElement).style?.width ?? '');
  return {
    type: 'image',
    props: {
      url: img.getAttribute('src') ?? '',
      caption,
      // `name` is what BlockNote writes into `alt`. Keeping the caption out of it
      // when there is a separate `<figcaption>` is what stops the same sentence
      // being announced twice by a screen reader.
      name: caption ? '' : stripTags(alt),
      showPreview: true,
      ...(width ? { previewWidth: width } : {}),
      // Borders have no home in BlockNote's image block. No stored page uses one,
      // and the serializer re-reads this prop, so a border survives a round trip
      // even though the editor has no control for it.
      ...(img.classList.contains(IMAGE_BORDER_CLASS) ? { bordered: true } : {}),
    },
  };
}

/**
 * A page's stored HTML as BlockNote blocks.
 *
 * `parser` is the DOM to parse with — the caller passes the one the server-side
 * BlockNote instance has shimmed onto globals, so this never assumes a browser.
 */
export function htmlToBlocks(html: string, parser: DOMParser): DocBlock[] {
  if (!html) return [];

  const doc = parser.parseFromString(
    `<!doctype html><body><div id="__root">${html}</div></body>`,
    'text/html',
  );
  const root = doc.getElementById('__root');
  if (!root) return [];

  const blocks: DocBlock[] = [];
  // Loose inline content between block tags becomes its own paragraph, the way
  // a browser would render it.
  let buffer: Inline[] = [];
  const flush = () => {
    if (buffer.some((run) => run.type === 'link' || run.text.trim())) {
      blocks.push({ type: 'paragraph', content: buffer });
    }
    buffer = [];
  };

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      if (text) buffer.push({ type: 'text', text, styles: {} });
      continue;
    }
    if (node.nodeType !== 1) continue;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'p' || tag === 'div') {
      flush();
      blocks.push({ type: 'paragraph', content: inlineFrom(el) });
      continue;
    }

    const header = HEADER_TAG.exec(tag);
    if (header) {
      flush();
      blocks.push({
        type: 'heading',
        props: { level: Number(header[1]) },
        content: inlineFrom(el),
      });
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      flush();
      const checklist = tag === 'ul' && el.classList.contains(CHECK_LIST_CLASS);
      const type =
        tag === 'ol' ? 'numberedListItem' : checklist ? 'checkListItem' : 'bulletListItem';
      blocks.push(...listItemsFrom(el, type, checklist));
      continue;
    }

    if (tag === 'blockquote') {
      flush();
      blocks.push({ type: 'quote', content: inlineFrom(el) });
      continue;
    }

    if (tag === 'hr') {
      flush();
      blocks.push({ type: 'divider', props: {} });
      continue;
    }

    if (tag === 'details') {
      flush();
      // Everything that isn't the headline is the body. Read from a clone, so a
      // page written before the body had its own wrapper still opens with its
      // content rather than losing it to an empty lookup.
      const summary = el.querySelector('summary');
      const clone = el.cloneNode(true) as Element;
      clone.querySelector('summary')?.remove();
      const body = clone.querySelector(`.${TOGGLE_BODY_CLASS}`) ?? clone;
      blocks.push({
        type: 'toggleListItem',
        content: summary ? inlineFrom(summary) : [],
        // The body is blocks, not text: a toggle can hold a list or a diagram,
        // and BlockNote already has a place for nested blocks.
        children: htmlToBlocks(body.innerHTML.trim(), parser),
      });
      continue;
    }

    if (tag === 'pre') {
      flush();
      // A mermaid diagram is a `<pre>` too — the marker class is what tells them
      // apart, and without it a diagram comes back as code that never draws.
      const mermaid = el.classList.contains(MERMAID_SOURCE_CLASS);
      blocks.push(
        codeBlock(el.textContent ?? '', mermaid ? MERMAID_LANGUAGE : languageOf(el) ?? 'text'),
      );
      continue;
    }

    if (tag === 'table') {
      flush();
      blocks.push(tableFrom(el));
      continue;
    }

    if (tag === 'figure') {
      // Checked before the image case: a diagram's `<figure>` holds no `<img>`,
      // so it would otherwise fall through and be flattened into a paragraph.
      if (el.classList.contains(MERMAID_BLOCK_CLASS)) {
        flush();
        blocks.push(codeBlock(el.textContent ?? '', MERMAID_LANGUAGE));
        continue;
      }
      const img = el.querySelector('img');
      if (img?.getAttribute('src')) {
        flush();
        const figcaption = el.querySelector('figcaption');
        blocks.push(imageFrom(img, figcaption ? figcaption.innerHTML.trim() : ''));
        continue;
      }
    }

    if (tag === 'img' && el.getAttribute('src')) {
      flush();
      blocks.push(imageFrom(el, ''));
      continue;
    }

    if (tag === 'video') {
      const src =
        el.getAttribute('src') || el.querySelector('source')?.getAttribute('src') || '';
      if (src) {
        flush();
        blocks.push({
          type: 'video',
          props: { url: src, caption: '', name: '', showPreview: true },
        });
        continue;
      }
    }

    // An inline tag at the top level joins the paragraph being built; anything
    // else becomes one of its own.
    if (STYLE_TAGS[tag] || tag === 'a' || tag === 'span' || tag === 'mark') {
      buffer.push(...wrap(el));
      continue;
    }

    flush();
    blocks.push({ type: 'paragraph', content: inlineFrom(el) });
  }

  flush();
  return blocks;
}

/** One inline element's runs, as if it were the only child of a paragraph. */
function wrap(el: Element): Inline[] {
  const holder = el.ownerDocument.createElement('span');
  holder.appendChild(el.cloneNode(true));
  return inlineFrom(holder);
}

/**
 * The language on a `<pre>` or its `<code>`, by the `language-x` convention
 * highlight.js and Prism use.
 *
 * Editor.js had no concept of a code language, so no stored page has one — but
 * BlockNote's code block has a language picker, and a choice the editor lets
 * somebody make has to survive being saved. Reading it from either element
 * covers both places the convention puts it.
 */
function languageOf(pre: Element): string | undefined {
  const code = pre.querySelector('code');
  for (const el of [code, pre]) {
    const match = el?.className?.match(/(?:^|\s)language-([\w+#-]+)/);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return undefined;
}

function codeBlock(code: string, language: string): DocBlock {
  return {
    type: 'codeBlock',
    props: { language },
    // A code block's content is plain — one unstyled run, newlines and all.
    content: [{ type: 'text', text: code.replace(/\n$/, ''), styles: {} }],
  };
}

// ── Blocks → HTML ─────────────────────────────────────────────────────────

/** One inline run as HTML, innermost mark first so nesting is stable. */
function renderInline(runs: Inline[] | undefined): string {
  return (runs ?? [])
    .map((run) => {
      if (run.type === 'link') {
        return `<a href="${escapeAttr(run.href)}">${renderInline(run.content)}</a>`;
      }
      // Newlines inside a run are the hard breaks the parser folded in.
      let html = escapeHtml(run.text).replace(/\n/g, '<br>');
      const s = run.styles ?? {};
      if (s.code) html = `<code>${html}</code>`;
      if (s.underline) html = `<u>${html}</u>`;
      if (s.strike) html = `<s>${html}</s>`;
      if (s.italic) html = `<i>${html}</i>`;
      if (s.bold) html = `<b>${html}</b>`;
      // `yellow` is what the parser reads a `<mark>` as; anything else is a
      // colour the editor's palette set and only a `<span>` can carry.
      if (s.backgroundColor && s.backgroundColor !== 'default') {
        html =
          s.backgroundColor === 'yellow'
            ? `<mark>${html}</mark>`
            : `<span style="background-color:${escapeAttr(s.backgroundColor)}">${html}</span>`;
      }
      if (s.textColor && s.textColor !== 'default') {
        html = `<span style="color:${escapeAttr(s.textColor)}">${html}</span>`;
      }
      return html;
    })
    .join('');
}

const inlineOf = (b: DocBlock): Inline[] =>
  Array.isArray(b.content) ? (b.content as Inline[]) : [];

const textOf = (b: DocBlock): string =>
  inlineOf(b)
    .map((run) => (run.type === 'text' ? run.text : run.content.map((c) => c.text).join('')))
    .join('');

/** Which `<ul>`/`<ol>` a list block belongs in, or `null` if it isn't one. */
function listKind(type: string): { tag: 'ul' | 'ol'; checklist: boolean } | null {
  if (type === 'bulletListItem') return { tag: 'ul', checklist: false };
  if (type === 'checkListItem') return { tag: 'ul', checklist: true };
  if (type === 'numberedListItem') return { tag: 'ol', checklist: false };
  return null;
}

function renderListItem(b: DocBlock, kind: { tag: 'ul' | 'ol'; checklist: boolean }): string {
  const checked = kind.checklist
    ? ` data-checked="${b.props?.['checked'] ? 'true' : 'false'}"`
    : '';
  // Nested items keep the parent's markers when they are the same kind of list,
  // and start their own when they aren't.
  const nested = groupBlocks(b.children ?? []);
  return `<li${checked}>${renderInline(inlineOf(b))}${nested}</li>`;
}

function renderTable(b: DocBlock): string {
  const table = b.content as TableContent | undefined;
  const rows = table?.rows ?? [];
  if (!rows.length) return '';

  const headerRows = table?.headerRows ?? 0;
  const headerCols = table?.headerCols ?? 0;

  // Widths ride along as a `<colgroup>` in percent, and `table-layout:fixed`
  // is inline rather than in a stylesheet so the widths hold everywhere the
  // stored HTML is painted — read views and public share pages included.
  // Dragging *one* column border is the common case, and it leaves every other
  // entry `undefined`. Requiring a full set here is what made that resize vanish
  // from every read surface, so any one width is enough to write the colgroup and
  // the untouched columns go out as a bare `<col>` — which under
  // `table-layout:fixed` is the same "share what's left" the editor is showing.
  const px = table?.columnWidths ?? [];
  const sized = px.length > 1 && px.some((w) => typeof w === 'number' && w > 0);
  const cols = sized
    ? `<colgroup>${px
        .map((w) =>
          typeof w === 'number' && w > 0
            ? `<col style="width:${round2((w / PAGE_COLUMN_PX) * 100)}%">`
            : '<col>',
        )
        .join('')}</colgroup>`
    : '';
  const open = sized ? '<table style="table-layout:fixed;width:100%">' : '<table>';

  // A header cell is a real `<th>` with a `scope`, not a styled `<td>`: it is
  // what a screen reader needs to announce "Revenue, Q3" instead of reading a
  // grid of loose numbers, and it is what tells the parser which header it was.
  const renderRow = (cells: TableCell[], rowIndex: number) => {
    const isHeadRow = rowIndex < headerRows;
    const html = cells
      .map((cell, col) => {
        const span =
          (cell.props?.colspan ?? 1) > 1 || (cell.props?.rowspan ?? 1) > 1
            ? ` colspan="${cell.props.colspan}" rowspan="${cell.props.rowspan}"`
            : '';
        const body = renderInline(cell.content);
        // The corner cell belongs to the header row *and* the header column;
        // `scope="col"` wins, because that is the heading it labels.
        if (isHeadRow) return `<th scope="col"${span}>${body}</th>`;
        if (col < headerCols) return `<th scope="row"${span}>${body}</th>`;
        return `<td${span}>${body}</td>`;
      })
      .join('');
    return `<tr>${html}</tr>`;
  };

  if (headerRows > 0) {
    const head = rows
      .slice(0, headerRows)
      .map((r, i) => renderRow(r.cells, i))
      .join('');
    const body = rows
      .slice(headerRows)
      .map((r, i) => renderRow(r.cells, i + headerRows))
      .join('');
    return `${open}${cols}<thead>${head}</thead>${body ? `<tbody>${body}</tbody>` : ''}</table>`;
  }
  return `${open}${cols}<tbody>${rows.map((r, i) => renderRow(r.cells, i)).join('')}</tbody></table>`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A block, and then whatever is nested under it.
 *
 * In BlockNote *any* block can have children: Tab indents a paragraph under the
 * line above it, and a toggle heading keeps its collapsible body there. Only list
 * items and toggles have a wrapper of their own to put that body in — everything
 * else used to render itself and silently drop `children`, so a Tab-indented line
 * was in the document, visible to whoever typed it, and simply absent from the
 * read view, the PDF, the public link and the MCP extract.
 *
 * The children are rendered as ordinary siblings rather than wrapped in some new
 * indented container. `docpages.content` has never had a nested-block shape —
 * `frontend/src/lib/editorjs.ts` reads and writes the same markup, and Editor.js
 * has no block nesting outside lists and toggles — so inventing one here would be
 * a shape the other half of the contract can't read. Flattening loses the indent
 * and keeps the words, which is the right way round: the indent is a writing aid,
 * the words are the document.
 */
function renderBlock(b: DocBlock): string {
  const self = renderBlockSelf(b);
  // Blocks that render their own children, and would otherwise render them twice.
  if (b.type === 'toggleListItem' || !b.children?.length) return self;
  return `${self}${groupBlocks(b.children)}`;
}

function renderBlockSelf(b: DocBlock): string {
  switch (b.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(b.props?.['level']) || 2));
      return `<h${level}>${renderInline(inlineOf(b))}</h${level}>`;
    }
    case 'quote': {
      const body = renderInline(inlineOf(b));
      return body.trim() ? `<blockquote>${body}</blockquote>` : '';
    }
    case 'divider':
      return '<hr>';
    case 'codeBlock': {
      const code = textOf(b);
      if (b.props?.['language'] === MERMAID_LANGUAGE) {
        if (!code.trim()) return '';
        // The source is the whole payload; the SVG is drawn from it wherever this
        // HTML is displayed, so the stored value stays small and stays editable.
        return `<figure class="${MERMAID_BLOCK_CLASS}"><pre class="${MERMAID_SOURCE_CLASS}"><code>${escapeHtml(code)}</code></pre></figure>`;
      }
      // `text` is BlockNote's default, i.e. "no language chosen" — writing
      // `language-text` would put a class on every code block ever saved.
      const language = String(b.props?.['language'] ?? '').trim().toLowerCase();
      const cls = language && language !== 'text' ? ` class="language-${escapeAttr(language)}"` : '';
      return `<pre><code${cls}>${escapeHtml(code)}</code></pre>`;
    }
    case 'toggleListItem': {
      const summary = renderInline(inlineOf(b));
      // Through `groupBlocks`, not `renderBlock`: a toggle's body is a document
      // of its own, and bullets inside one have to become a `<ul>` just as they
      // would outside it — mapping over the children would emit loose `<p>`s.
      const body = groupBlocks(b.children ?? []);
      if (!summary.trim() && !body.trim()) return '';
      return `<details class="${TOGGLE_CLASS}"><summary>${summary}</summary><div class="${TOGGLE_BODY_CLASS}">${body}</div></details>`;
    }
    case 'table':
      return renderTable(b);
    case 'image': {
      const url = String(b.props?.['url'] ?? '');
      if (!url) return '';
      const caption = String(b.props?.['caption'] ?? '');
      const name = String(b.props?.['name'] ?? '');
      const width = Number(b.props?.['previewWidth']) || 0;
      const cls = b.props?.['bordered'] ? ` class="${IMAGE_BORDER_CLASS}"` : '';
      const style = width ? ` style="width:${width}px"` : '';
      const alt = escapeAttr(stripTags(caption || name));
      const img = `<img src="${escapeAttr(url)}" alt="${alt}"${cls}${style}>`;
      return caption ? `<figure>${img}<figcaption>${caption}</figcaption></figure>` : img;
    }
    case 'video': {
      const url = String(b.props?.['url'] ?? '');
      // `controls` is not decoration: without it the video cannot be played.
      return url ? `<video src="${escapeAttr(url)}" controls></video>` : '';
    }
    /*
     * Audio and attachments.
     *
     * These two are in BlockNote's default schema, so dropping an mp3 or a PDF
     * onto the editor makes one — and until this case existed they fell through
     * to the paragraph below and became an empty `<p>`. A file that uploads,
     * appears in the editor and then isn't in the saved page is the worst kind
     * of bug, so both get the plainest markup that still works everywhere: audio
     * plays, a file is a link you can click.
     */
    case 'audio':
    case 'file': {
      const url = String(b.props?.['url'] ?? '');
      if (!url) return '';
      const caption = String(b.props?.['caption'] ?? '');
      if (b.type === 'audio') {
        const player = `<audio src="${escapeAttr(url)}" controls></audio>`;
        return caption ? `<figure>${player}<figcaption>${caption}</figcaption></figure>` : player;
      }
      // The upload's own name, falling back to the last path segment — a link
      // labelled with the URL is a link nobody can read.
      const name = String(b.props?.['name'] ?? '').trim() || url.split('/').pop() || url;
      const link = `<a href="${escapeAttr(url)}">${escapeHtml(stripTags(name))}</a>`;
      return `<p>${link}${caption ? ` ${caption}` : ''}</p>`;
    }
    default:
      // paragraph, and anything a future BlockNote version adds that still holds
      // inline content — better a readable paragraph than a dropped block.
      return `<p>${renderInline(inlineOf(b))}</p>`;
  }
}

/**
 * Runs of list items become one list; everything else renders on its own.
 *
 * Grouping is what makes three bullets a `<ul>` with three `<li>` rather than
 * three separate one-item lists — the difference between a list and a stutter.
 */
function groupBlocks(blocks: DocBlock[]): string {
  let html = '';
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i]!;
    const kind = listKind(block.type);
    if (!kind) {
      html += renderBlock(block);
      i += 1;
      continue;
    }
    // Take every following item of the same kind into the same list.
    const items: DocBlock[] = [];
    while (i < blocks.length) {
      const next = blocks[i]!;
      const nextKind = listKind(next.type);
      if (!nextKind || nextKind.tag !== kind.tag || nextKind.checklist !== kind.checklist) break;
      items.push(next);
      i += 1;
    }
    const open = kind.checklist ? `<ul class="${CHECK_LIST_CLASS}">` : `<${kind.tag}>`;
    html += `${open}${items.map((item) => renderListItem(item, kind)).join('')}</${kind.tag}>`;
  }

  return html;
}

/**
 * BlockNote blocks as the HTML `docpages.content` stores.
 *
 * A lone paragraph is stored as its bare inline HTML, with no `<p>` wrapper —
 * matching `blocksToHtml` in `frontend/src/lib/editorjs.ts`, because that is
 * what `isRichHtml` there has always been given for a one-line value.
 */
export function blocksToHtml(blocks: DocBlock[]): string {
  if (!blocks.length) return '';
  if (blocks.length === 1 && blocks[0]!.type === 'paragraph') {
    return renderInline(inlineOf(blocks[0]!));
  }
  return groupBlocks(blocks);
}

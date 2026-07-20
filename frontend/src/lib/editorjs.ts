// HTML ⇄ Editor.js block converters. The editor edits blocks, but we store plain
// HTML in the `description` string field — so existing plain-text descriptions
// round-trip as a single paragraph, and nothing else in the app has to change.
// Ported from old-report/lib/editorjs.ts.

// @editorjs/list v2 stores each item as an object with nested children.
// Legacy data (and our HTML round-trip) may still produce plain strings.
export type ListItem = string | { content?: string; items?: ListItem[] };

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
  | {
      type: 'table';
      data: { withHeadings: boolean; content: string[][] };
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
function parseListItems(listEl: Element): ListItem[] {
  return Array.from(listEl.children)
    .filter((c) => c.tagName.toLowerCase() === 'li')
    .map((li) => {
      const items = Array.from(li.children)
        .filter(isListTag)
        .flatMap((nested) => parseListItems(nested));
      const clone = li.cloneNode(true) as Element;
      Array.from(clone.children)
        .filter(isListTag)
        .forEach((c) => clone.removeChild(c));
      return { content: clone.innerHTML.trim(), items };
    });
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
      blocks.push({
        type: 'list',
        data: {
          style: tag === 'ol' ? 'ordered' : 'unordered',
          items: parseListItems(el),
        },
      });
      continue;
    }
    if (tag === 'pre') {
      flush();
      blocks.push({ type: 'code', data: { code: el.textContent ?? '' } });
      continue;
    }
    if (tag === 'table') {
      flush();
      const rowEls = Array.from(el.querySelectorAll('tr'));
      const content = rowEls.map((tr) =>
        Array.from(tr.children)
          .filter((c) => {
            const t = c.tagName.toLowerCase();
            return t === 'td' || t === 'th';
          })
          .map((cell) => cell.innerHTML),
      );
      const hasTh = !!el.querySelector('thead th, tr:first-child th');
      blocks.push({
        type: 'table',
        data: { withHeadings: hasTh, content },
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

function renderListItems(items: ListItem[] | undefined, tag: 'ol' | 'ul'): string {
  return (items ?? [])
    .map((item) => {
      // Legacy @editorjs/list v1 data stored items as plain strings.
      if (typeof item === 'string') return `<li>${item}</li>`;
      const content = item?.content ?? '';
      const children = Array.isArray(item?.items) ? item.items : [];
      const nested = children.length
        ? `<${tag}>${renderListItems(children, tag)}</${tag}>`
        : '';
      return `<li>${content}${nested}</li>`;
    })
    .join('');
}

function renderBlock(b: HtmlEditorBlock): string {
  if (b.type === 'header') {
    const level = Math.min(6, Math.max(1, b.data.level || 2));
    return `<h${level}>${b.data.text ?? ''}</h${level}>`;
  }
  if (b.type === 'list') {
    const tag = b.data.style === 'ordered' ? 'ol' : 'ul';
    return `<${tag}>${renderListItems(b.data.items, tag)}</${tag}>`;
  }
  if (b.type === 'code') {
    return `<pre><code>${escapeHtml(b.data.code ?? '')}</code></pre>`;
  }
  if (b.type === 'table') {
    const rows = b.data.content ?? [];
    if (rows.length === 0) return '';
    const withHeadings = !!b.data.withHeadings;
    const renderRow = (cells: string[], useTh: boolean) =>
      `<tr>${cells.map((c) => `<${useTh ? 'th' : 'td'}>${c ?? ''}</${useTh ? 'th' : 'td'}>`).join('')}</tr>`;
    if (withHeadings) {
      const [head, ...body] = rows;
      const thead = `<thead>${renderRow(head, true)}</thead>`;
      const tbody = body.length
        ? `<tbody>${body.map((r) => renderRow(r, false)).join('')}</tbody>`
        : '';
      return `<table>${thead}${tbody}</table>`;
    }
    return `<table><tbody>${rows.map((r) => renderRow(r, false)).join('')}</tbody></table>`;
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
  if (blocks.length === 1 && blocks[0].type === 'paragraph') {
    return blocks[0].data.text ?? '';
  }
  return blocks.map(renderBlock).join('');
}

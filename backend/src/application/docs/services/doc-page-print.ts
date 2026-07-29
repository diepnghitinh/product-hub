import { DocFontSize, DocFontStyle } from '../domain/enums/doc.enums';

/**
 * A doc page as a standalone HTML document, for printing.
 *
 * The page body is stored as HTML (the editor's own format), so an export is
 * mostly a stylesheet: put the stored markup in a document that paints it the
 * way the app does, and let Chrome paginate. That is why the wrapper carries the
 * app's own class names — `rich-text-content doc-page-read` — and why the rules
 * below are the read view's rules. When one moves, the other is meant to be an
 * obvious edit away, not a rediscovery.
 *
 * What is deliberately *not* here: the app's chrome. No sidebar, no toolbar, no
 * "Add file" row, no comment marks. A PDF is the document, not the workspace.
 */

/** Everything the template needs. Flat on purpose — it mirrors the page DTO. */
export interface DocPagePrintInput {
  docTitle: string;
  title: string;
  /** The page body, as stored. */
  content: string;
  coverUrl: string;
  updatedByName: string;
  updatedAt: Date;
  fontStyle: DocFontStyle;
  fontSize: DocFontSize;
  showTitle: boolean;
  showCover: boolean;
  showUpdated: boolean;
  showLinks: boolean;
  showAttachments: boolean;
  links: { title: string }[];
  attachments: { name: string; size: number }[];
  /** UI language of whoever asked for the file. */
  locale: string;
}

/** The handful of words the PDF adds around the page's own writing. */
const LABELS: Record<string, { updatedBy: string; links: string; attachments: string }> = {
  en: { updatedBy: 'Updated by', links: 'Linked to', attachments: 'Attachments' },
  ko: { updatedBy: '수정자', links: '연결된 항목', attachments: '첨부 파일' },
};

const FONT_FAMILY: Record<DocFontStyle, string> = {
  [DocFontStyle.System]:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  [DocFontStyle.Serif]: 'Georgia, Cambria, "Times New Roman", Times, serif',
  [DocFontStyle.Mono]: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

/** Matches the Page Styles sizes (0.9375 / 1 / 1.125 rem at a 16px root). */
const FONT_PX: Record<DocFontSize, number> = {
  [DocFontSize.Small]: 15,
  [DocFontSize.Default]: 16,
  [DocFontSize.Large]: 18,
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * The document's own stylesheet. The app's tokens are inlined as literal values
 * rather than imported: this HTML is built by the server and never sees the
 * frontend bundle, and a colour that silently resolved to nothing would print as
 * an invisible rule or a white-on-white chip.
 */
function printCss(input: DocPagePrintInput): string {
  const family = FONT_FAMILY[input.fontStyle] ?? FONT_FAMILY[DocFontStyle.System];
  const size = FONT_PX[input.fontSize] ?? FONT_PX[DocFontSize.Default];
  return `
    :root {
      --fg: hsl(0 0% 3.9%);
      --muted-fg: hsl(0 0% 45.1%);
      --muted: hsl(0 0% 96.1%);
      --border: hsl(0 0% 89.8%);
      --accent: hsl(252 60% 59%);
      --warning: hsl(35 92% 40%);
      --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ${family};
      font-size: ${size}px;
      line-height: 1.6;
      color: var(--fg);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Page Styles' width setting isn't honoured here on purpose: A4 inside the
       print margins is ~178mm, already narrower than the app's "default"
       measure, so both settings would paginate identically. */

    .doc-cover { width: 100%; height: 42mm; object-fit: cover; border-radius: 6px; margin-bottom: 8mm; }
    .doc-title { font-size: 2em; font-weight: 700; line-height: 1.2; margin: 0 0 0.15em; }
    .doc-byline { margin: 0 0 1.4em; font-size: 0.75em; color: var(--muted-fg); }
    .doc-meta { margin-top: 10mm; padding-top: 4mm; border-top: 1px solid var(--border); font-size: 0.8em; }
    .doc-meta h2 { margin: 0 0 0.3em; font-size: 0.85em; font-weight: 600; color: var(--muted-fg); text-transform: uppercase; letter-spacing: 0.04em; }
    .doc-meta ul { margin: 0 0 1em; padding-left: 1.2em; list-style: disc; color: var(--fg); }
    .doc-meta .size { color: var(--muted-fg); }

    /* ── The read view, transcribed ─────────────────────────────────────────
       Same selectors as rich-text-editor.css so the two stay comparable. */
    .doc-page-read > * { padding-block: 0.4em; }
    .rich-text-content :is(h1, h2, h3, h4, h5, h6) { font-weight: 600; line-height: 1.3; margin: 0.2em 0; }
    .rich-text-content h1 { font-size: 1.75em; }
    .rich-text-content h2 { font-size: 1.4em; }
    .rich-text-content h3 { font-size: 1.15em; }
    .rich-text-content :is(h4, h5, h6) { font-size: 1em; }
    .rich-text-content p { margin: 0; }
    .rich-text-content a { color: var(--accent); text-decoration: underline; }
    .rich-text-content :is(ul, ol):not([class]) { margin: 0.2em 0; padding-left: 1.4em; }
    .rich-text-content ul:not([class]) { list-style: disc; }
    .rich-text-content ol:not([class]) { list-style: decimal; }
    .rich-text-content :is(ul, ol) ul:not([class]) { list-style: circle; }
    .rich-text-content .rte-list { margin: 0.2em 0; padding-left: 1.1em; list-style: disc; }
    .rich-text-content .rte-check { margin: 0.2em 0; padding-left: 1.4em; list-style: none; }
    .rich-text-content .rte-check > li { position: relative; }
    .rich-text-content .rte-check > li::before {
      content: ''; position: absolute; top: 0.3em; left: -1.25em;
      width: 0.9em; height: 0.9em; border: 1.5px solid var(--muted-fg); border-radius: 0.25em;
    }
    .rich-text-content .rte-check > li[data-checked='true'] { color: var(--muted-fg); text-decoration: line-through; }
    .rich-text-content .rte-check > li[data-checked='true']::before { border-color: var(--accent); background: var(--accent); }
    .rich-text-content .rte-check > li[data-checked='true']::after {
      content: ''; position: absolute; top: 0.47em; left: -1.06em; width: 0.45em; height: 0.22em;
      border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(-45deg);
    }
    .rich-text-content blockquote { margin: 0.2em 0; padding: 0.05em 0 0.05em 0.9em; border-left: 3px solid hsl(0 0% 45.1% / 0.4); }
    .rich-text-content hr { border: 0; border-top: 1px solid hsl(0 0% 45.1% / 0.3); margin: 0.6em 0; }
    .rich-text-content mark, .rich-text-content .cdx-marker { background: hsl(35 92% 40% / 0.35); border-radius: 2px; padding: 0 0.15em; }
    .rich-text-content code.inline-code, .rich-text-content .cdx-inline-code {
      background: var(--muted); border-radius: 3px; padding: 0.1em 0.3em; font-family: var(--mono); font-size: 0.85em;
    }
    .rich-text-content pre {
      background: var(--muted); border: 1px solid var(--border); border-radius: 8px;
      padding: 0.75rem 1rem; font-family: var(--mono); font-size: 0.8125rem; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
    }
    .rich-text-content .rte-mention, .rich-text-content .rte-date {
      display: inline-block; padding: 0 0.3em; border-radius: 0.3rem; font-weight: 500; white-space: nowrap;
    }
    .rich-text-content .rte-mention { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
    .rich-text-content .rte-date { background: var(--muted); color: var(--muted-fg); }
    .rich-text-content table { border-collapse: collapse; width: 100%; }
    .rich-text-content :is(td, th) { border: 1px solid var(--border); padding: 0.4rem 0.6rem; overflow-wrap: break-word; }
    .rich-text-content th { text-align: left; font-weight: 600; }
    /* A doubled gridline where the headers stop — the read view's rule, kept in
       step so a printed table has the same shape as the one on screen. */
    .rich-text-content th[scope="col"] { border-bottom-width: 2px; }
    .rich-text-content th[scope="row"] { border-right-width: 2px; }
    .rich-text-content img { max-width: 100%; height: auto; border-radius: 4px; }
    .rich-text-content .img-bordered { outline: 1px solid var(--border); outline-offset: 2px; }
    .rich-text-content figcaption { font-size: 0.8em; color: var(--muted-fg); text-align: center; margin-top: 0.3em; }
    .rich-text-content video { display: none; }

    /* A toggle is printed open — paper doesn't unfold. The marker is dropped
       with it: a chevron pointing at text that is already there reads as a
       control the reader can't use. */
    .rich-text-content .rte-toggle > summary { list-style: none; font-weight: 600; }
    .rich-text-content .rte-toggle > summary::-webkit-details-marker { display: none; }
    .rich-text-content .rte-toggle__body { padding-left: 1.1em; }

    /* Mermaid: the source is the stored payload and the picture is drawn from it
       before printing. Until that runs (or if it fails) the source is what's
       shown — a diagram nobody can read is worse than the text that makes it. */
    .rich-text-content .mermaid-block { margin: 0.6em 0; text-align: center; }
    .rich-text-content .mermaid-block svg { max-width: 100%; height: auto; }
    .rich-text-content .mermaid-block.drawn .mermaid-source { display: none; }

    /* ── Pagination ────────────────────────────────────────────────────────
       Chrome breaks pages wherever it likes unless told otherwise. These are
       the four rules that stop a document looking accidental: no heading alone
       at the foot of a page, no row or list item split down the middle, and a
       table's header repeated on every page it runs onto. */
    h1, h2, h3, h4 { break-after: avoid; break-inside: avoid; }
    li, tr, blockquote, figure, img, pre, .rte-toggle { break-inside: avoid; }
    thead { display: table-header-group; }
    .doc-title { break-after: avoid; }
  `;
}

/** The page as one printable HTML document. */
export function docPagePrintHtml(input: DocPagePrintInput): string {
  const labels = LABELS[input.locale] ?? LABELS.en;
  const date = new Intl.DateTimeFormat(input.locale === 'ko' ? 'ko-KR' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(input.updatedAt);

  const head = [
    input.showCover && input.coverUrl
      ? `<img class="doc-cover" src="${escapeHtml(input.coverUrl)}" alt="">`
      : '',
    input.showTitle ? `<h1 class="doc-title">${escapeHtml(input.title)}</h1>` : '',
    input.showUpdated
      ? `<p class="doc-byline">${escapeHtml(labels.updatedBy)} ${escapeHtml(input.updatedByName)} · ${escapeHtml(date)}</p>`
      : '',
  ].join('');

  const list = (heading: string, items: string[]) =>
    items.length
      ? `<h2>${escapeHtml(heading)}</h2><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
      : '';
  const meta = [
    input.showLinks ? list(labels.links, input.links.map((l) => escapeHtml(l.title))) : '',
    input.showAttachments
      ? list(
          labels.attachments,
          input.attachments.map((a) => {
            const size = formatBytes(a.size);
            return `${escapeHtml(a.name)}${size ? ` <span class="size">· ${size}</span>` : ''}`;
          }),
        )
      : '',
  ].join('');

  return `<!doctype html>
<html lang="${escapeHtml(input.locale)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.title || input.docTitle)}</title>
<style>${printCss(input)}</style>
</head>
<body>
${head}
<div class="rich-text-content doc-page-read">${input.content}</div>
${meta ? `<div class="doc-meta">${meta}</div>` : ''}
</body>
</html>`;
}

/** A filename someone can find again: `Release plan.pdf`, minus what filesystems refuse. */
export function pdfFilename(title: string, fallback: string): string {
  const clean = (title || fallback || 'document')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${clean || 'document'}.pdf`;
}

// The `/` menu — one menu for the whole editor.
//
// It runs in two places, and the difference is only *what it can insert*:
//  · `host: 'cell'` — inside a table cell, where Editor.js's own toolbox never
//    reaches, so everything it offers is inline HTML written into the cell;
//  · `host: 'block'` — anywhere in a block, where it can also create blocks
//    (`editor.blocks.insert`) on top of the inline chips a paragraph can hold.
//
// One class rather than two, because the interesting parts are the same in both:
// tracking the `/query` under the caret, the calendar, the people list, the
// keyboard. Two copies would drift, and a `/` that means one thing in a cell and
// another in a paragraph is worse than either.
//
// Why `/` in a block needs us at all: Editor.js's `slashPressed` only opens its
// toolbox when the block is *empty*, so typing `Date: /` left a bare slash and no
// menu. This owns the key everywhere instead, so the gesture behaves the same
// mid-line as it does on a fresh one. (The `+` button still opens the stock
// toolbox — nothing is taken away.)
//
// Where the popup lives matters as much as what it does. It is appended to
// `document.body`, never to the block or cell:
//  · a node inside a `.tc-cell` is read back by the stock table's `getData()` as
//    cell *content*, so a menu built in place would be saved into the document;
//  · `.report-workspace` redefines `--primary`/`--border` as full colours, so a
//    popup rendered inside a report editor would lose its tokens — at body level
//    it is always in app scope;
//  · it can't be clipped by the table's own overflow.
//
// The `/query` the user types stays in the text until something is actually
// inserted, so there are exactly two places that edit the document: `insert()`
// (inline HTML) and `insertBlock()` (a new block).
import type EditorJS from '@editorjs/editorjs';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { formatDate, initials } from '@/lib/format';
// What a list is, in both shapes — shared with the `*`/`1.`/`[]` shortcuts so a
// bullet made from the menu and one typed by hand are the same markup.
import { cellListHtml, listBlockData, trimSeedPad } from './listMarkup';
// One upload path for the whole editor: storage when it's configured, an inline
// compressed data URL when it isn't.
import { toUrl } from './ResizableImageTool';

/** Someone who can be `@`-mentioned. Flat by design — it is passed as editor config. */
export interface SlashPerson {
  id: string;
  name: string;
  email: string;
}

export interface SlashMenuConfig {
  /**
   * People offered by the mention item; the item is hidden while this is empty.
   * A getter, not an array: blocks are constructed when the editor mounts, which
   * is before the workspace's member list has come back.
   */
  people?: () => SlashPerson[];
  /** Whether image upload is available in this editor (mirrors the editor's own flag). */
  images?: boolean;
  /** Tell the editor the document changed, so it saves. */
  onChange?: () => void;
  /** Which surface the menu is serving. Defaults to a table cell. */
  host?: 'cell' | 'block';
  /** The editor, for the block items. Required by `host: 'block'`. */
  editor?: EditorJS;
  /**
   * The editor's own tool flags, mirrored so the menu offers exactly the blocks
   * that surface actually has — a comment box has no headings or tables, and a
   * plain description has no diagrams.
   */
  minimal?: boolean;
  diagrams?: boolean;
}

interface SlashItem {
  key: string;
  label: string;
  /**
   * Extra words the filter matches on, so `/bullet` and `/ul` both find the
   * list. Always includes the English name: people type `/date` whatever
   * language the interface is in, and only the label is translated.
   */
  keywords: string;
  icon: string;
  run: () => void;
}

type Mode = 'root' | 'people' | 'date' | 'link';

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** "H1"…"H4" — the level *is* the icon, matching the stock block menu's entries. */
const headingIcon = (level: number) =>
  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><text x="12" y="18" text-anchor="middle" font-size="15" font-weight="600" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif">H${level}</text></svg>`;

const ICONS = {
  text: icon('<path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/>'),
  bullet: icon(
    '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  ),
  numbered: icon(
    '<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  ),
  check: icon('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'),
  quote: icon(
    '<path d="M6 17h3l2-4V7H5v6h3z"/><path d="M16 17h3l2-4V7h-6v6h3z"/>',
  ),
  toggle: icon(
    '<path d="m6 9 3 3-3 3"/><line x1="13" y1="6" x2="21" y2="6"/><line x1="13" y1="12" x2="21" y2="12"/><line x1="13" y1="18" x2="21" y2="18"/>',
  ),
  divider: icon('<line x1="3" y1="12" x2="21" y2="12"/>'),
  table: icon(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
  ),
  link: icon(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ),
  code: icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  codeBlock: icon(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 9-2 3 2 3"/><path d="m15 9 2 3-2 3"/>',
  ),
  image: icon(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  ),
  video: icon('<rect x="2" y="4" width="14" height="16" rx="2"/><path d="M16 9l6-3v12l-6-3"/>'),
  diagram: icon(
    '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  ),
  mention: icon('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>'),
  date: icon('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
  back: icon('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
};

/** The four heading levels the editor offers, in the order the block menu lists them. */
const HEADING_KEYS = [
  'editor.blockHeading1',
  'editor.blockHeading2',
  'editor.blockHeading3',
  'editor.blockHeading4',
] as const;

/** `/` counts only at the start of a line or after a space — not mid-word or in a URL. */
const SLASH = /(?:^|[\s ])\/([^\s ]*)$/;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `YYYY-MM-DD` in local time — `toISOString()` would shift the day for anyone east of UTC. */
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class SlashMenu {
  private readonly config: SlashMenuConfig;
  private root: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  /** The editable the menu was opened from — a table cell, or a block's own. */
  private host: HTMLElement | null = null;
  /** What `bind()` was attached to, so a selection outside it is ignored. */
  private scope: HTMLElement | null = null;
  /** The text node holding the `/`, and where in it that `/` sits. */
  private anchorNode: Text | null = null;
  private anchorStart = 0;
  private query = '';
  /** The query as it was when a submenu opened, so the rest of it filters that submenu. */
  private queryBase = '';
  private mode: Mode = 'root';
  private items: SlashItem[] = [];
  private active = 0;
  private month = new Date();
  /** Set while `insert()` rewrites the text, so our own edits don't re-trigger the menu. */
  private busy = false;
  private unbind: (() => void) | null = null;

  constructor(config: SlashMenuConfig = {}) {
    this.config = config;
  }

  private get inBlock() {
    return this.config.host === 'block';
  }

  /**
   * Listen in the capture phase: the stock table binds Enter and Tab on
   * `.tc-table` and the cells themselves, and Editor.js binds its own keys on the
   * redactor — capturing one level above both is what lets the menu take those
   * keys first while it is open.
   */
  bind(scope: HTMLElement) {
    this.unbind?.();
    this.scope = scope;
    const onInput = () => {
      if (!this.busy) this.refresh();
    };
    const onKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    const onPointerDown = (e: PointerEvent) => {
      if (this.root && !this.root.contains(e.target as Node)) this.close();
    };
    scope.addEventListener('input', onInput);
    scope.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    this.unbind = () => {
      scope.removeEventListener('input', onInput);
      scope.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }

  destroy() {
    this.unbind?.();
    this.unbind = null;
    this.scope = null;
    this.close();
  }

  // ── Tracking the `/query` in the text ──────────────────────────────────────

  /**
   * The editable the caret is in, if this menu is the one that serves it. In a
   * block editor that is any block's editable *except* a table cell, which has
   * its own instance of this menu, and except a code block, which is a real
   * `<textarea>` where a slash is only ever a slash.
   */
  private hostFor(node: Node): HTMLElement | null {
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    if (!el) return null;
    const cell = el.closest<HTMLElement>('.tc-cell');
    if (!this.inBlock) return cell;
    if (cell || el.closest('input, textarea')) return null;
    return el.closest<HTMLElement>('.ce-block [contenteditable="true"]');
  }

  /** Re-read the caret. Opens, filters, or closes the menu to match what's typed. */
  private refresh() {
    if (this.mode === 'link') return; // the URL field owns the caret while it's open
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !sel.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE) return this.close();
    if (this.scope && !this.scope.contains(node)) return this.close();
    const host = this.hostFor(node);
    if (!host) return this.close();

    const text = node.textContent ?? '';
    const before = text.slice(0, sel.anchorOffset);
    const match = before.match(SLASH);
    if (!match) return this.close();

    this.host = host;
    this.anchorNode = node as Text;
    this.anchorStart = before.length - match[1].length - 1;
    this.query = match[1];
    if (this.mode === 'root' && !this.query.startsWith(this.queryBase)) this.queryBase = '';
    this.open();
  }

  private get typed(): string {
    return this.query.slice(this.queryBase.length).toLowerCase();
  }

  // ── The popup ──────────────────────────────────────────────────────────────

  private open() {
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.className = 'rte-slash';
      this.root.setAttribute('role', 'listbox');
      this.root.setAttribute('contenteditable', 'false');
      // Keep the caret in the text: a pointerdown that lands on the menu must not
      // move focus, or the range we are about to write into stops existing.
      this.root.addEventListener('pointerdown', (e) => e.preventDefault());
      document.body.appendChild(this.root);
    }
    this.render();
    this.position();
  }

  private close() {
    this.root?.remove();
    this.root = null;
    this.listEl = null;
    this.mode = 'root';
    this.queryBase = '';
    this.active = 0;
  }

  private get isOpen() {
    return !!this.root;
  }

  /** Anchor to the `/` itself — a collapsed range has no rect to measure in every browser. */
  private position() {
    const root = this.root;
    const node = this.anchorNode;
    if (!root || !node) return;
    const range = document.createRange();
    range.setStart(node, this.anchorStart);
    range.setEnd(node, Math.min(this.anchorStart + 1, node.length));
    const caret = range.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(caret.left, window.innerWidth - box.width - margin));
    // Flip above the caret when there isn't room below it.
    const below = caret.bottom + 6;
    const top = below + box.height > window.innerHeight - margin ? caret.top - box.height - 6 : below;
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  private render() {
    const root = this.root;
    if (!root) return;
    root.innerHTML = '';
    if (this.mode === 'date') return this.renderDate(root);
    if (this.mode === 'link') return this.renderLink(root);

    this.items = this.mode === 'people' ? this.peopleItems() : this.rootItems();
    const filter = this.typed;
    if (filter) {
      this.items = this.items.filter((i) =>
        `${i.label} ${i.keywords}`.toLowerCase().includes(filter),
      );
    }
    if (this.active >= this.items.length) this.active = Math.max(0, this.items.length - 1);

    if (this.mode === 'people') root.appendChild(this.header(t('editor.slashMention')));
    const list = document.createElement('div');
    list.className = 'rte-slash__list';
    this.listEl = list;
    if (!this.items.length) {
      const empty = document.createElement('div');
      empty.className = 'rte-slash__empty';
      empty.textContent = t('editor.slashNoResults');
      list.appendChild(empty);
    }
    this.items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = `rte-slash__item${i === this.active ? ' is-active' : ''}`;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(i === this.active));
      el.innerHTML = `<span class="rte-slash__icon">${item.icon}</span><span class="rte-slash__label"></span>`;
      (el.querySelector('.rte-slash__label') as HTMLElement).textContent = item.label;
      el.addEventListener('mouseenter', () => this.setActive(i));
      el.addEventListener('click', () => item.run());
      list.appendChild(el);
    });
    root.appendChild(list);
    this.position();
  }

  private header(label: string): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'rte-slash__header';
    bar.innerHTML = `<span class="rte-slash__back">${ICONS.back}</span><span></span>`;
    (bar.querySelector('span:last-child') as HTMLElement).textContent = label;
    bar.addEventListener('click', () => this.toRoot());
    return bar;
  }

  private toRoot() {
    this.mode = 'root';
    this.queryBase = this.query;
    this.active = 0;
    this.render();
  }

  private setActive(i: number) {
    this.active = i;
    this.listEl?.querySelectorAll('.rte-slash__item').forEach((el, n) => {
      el.classList.toggle('is-active', n === i);
      el.setAttribute('aria-selected', String(n === i));
      // The block list is longer than the popup, so walking it with the arrows
      // has to bring the selection along.
      if (n === i) el.scrollIntoView({ block: 'nearest' });
    });
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  private rootItems(): SlashItem[] {
    return this.inBlock ? this.blockRootItems() : this.cellRootItems();
  }

  /**
   * In a cell there are no blocks to make, so structure is inline HTML written
   * into the cell — a `<ul>` in a table cell is still a list.
   */
  private cellRootItems(): SlashItem[] {
    const items: SlashItem[] = [
      {
        key: 'bullet',
        label: t('editor.slashBullet'),
        keywords: 'bullet ul list 목록',
        icon: ICONS.bullet,
        run: () => this.insert(cellListHtml('unordered'), 'inside'),
      },
      {
        key: 'numbered',
        label: t('editor.slashNumbered'),
        keywords: 'numbered ol ordered list 번호',
        icon: ICONS.numbered,
        run: () => this.insert(cellListHtml('ordered'), 'inside'),
      },
      {
        key: 'checklist',
        label: t('editor.slashChecklist'),
        keywords: 'checklist todo task check 체크',
        icon: ICONS.check,
        run: () => this.insert(cellListHtml('checklist'), 'inside'),
      },
      ...this.inlineItems(),
    ];
    return items;
  }

  /**
   * In a block the menu can do what the stock toolbox does *and* what it can't:
   * the block types are the editor's own tools, in the order a page gets built,
   * followed by the inline chips a paragraph can hold.
   *
   * The flags mirror the editor's `tools` config exactly — a menu that offered a
   * table in a comment box would insert a block that surface has no tool for.
   */
  private blockRootItems(): SlashItem[] {
    const full = !this.config.minimal;
    const items: SlashItem[] = [
      {
        key: 'text',
        label: t('editor.slashText'),
        keywords: 'text paragraph plain 본문 텍스트',
        icon: ICONS.text,
        run: () => this.insertBlock('paragraph'),
      },
    ];
    if (full) {
      HEADING_KEYS.forEach((key, i) => {
        const level = i + 1;
        items.push({
          key: `h${level}`,
          label: t(key),
          keywords: `heading h${level} title 제목`,
          icon: headingIcon(level),
          run: () => this.insertBlock('header', { level, text: '' }),
        });
      });
    }
    items.push(
      {
        key: 'bullet',
        label: t('editor.slashBullet'),
        keywords: 'bullet ul list unordered 목록',
        icon: ICONS.bullet,
        run: () => this.insertBlock('list', listBlockData('unordered')),
      },
      {
        key: 'numbered',
        label: t('editor.slashNumbered'),
        keywords: 'numbered ol ordered list 번호',
        icon: ICONS.numbered,
        run: () => this.insertBlock('list', listBlockData('ordered')),
      },
      {
        key: 'checklist',
        label: t('editor.slashChecklist'),
        keywords: 'checklist todo task check 체크',
        icon: ICONS.check,
        run: () => this.insertBlock('list', listBlockData('checklist')),
      },
    );
    if (full) {
      items.push(
        {
          key: 'quote',
          label: t('editor.blockQuote'),
          keywords: 'quote blockquote cite 인용',
          icon: ICONS.quote,
          run: () => this.insertBlock('quote'),
        },
        {
          key: 'toggle',
          label: t('editor.blockToggle'),
          keywords: 'toggle details collapse fold 토글',
          icon: ICONS.toggle,
          run: () => this.insertBlock('toggle'),
        },
        {
          key: 'divider',
          label: t('editor.blockDivider'),
          keywords: 'divider hr rule line separator 구분선',
          icon: ICONS.divider,
          run: () => this.insertBlock('divider'),
        },
        {
          key: 'table',
          label: t('editor.slashTable'),
          keywords: 'table grid rows columns 표',
          icon: ICONS.table,
          run: () => this.insertBlock('table'),
        },
      );
    }
    items.push({
      key: 'codeBlock',
      label: t('editor.slashCodeBlock'),
      keywords: 'code block snippet pre 코드',
      icon: ICONS.codeBlock,
      run: () => this.insertBlock('code'),
    });
    if (this.config.images) {
      items.push(
        {
          key: 'image',
          label: t('editor.blockImage'),
          keywords: 'image picture photo upload 이미지',
          icon: ICONS.image,
          run: () => this.insertBlock('image'),
        },
        {
          key: 'video',
          label: t('editor.blockVideo'),
          keywords: 'video clip movie 동영상',
          icon: ICONS.video,
          run: () => this.insertBlock('video'),
        },
      );
    }
    if (this.config.diagrams) {
      items.push({
        key: 'diagram',
        label: t('editor.blockDiagram'),
        keywords: 'diagram mermaid flowchart chart 다이어그램',
        icon: ICONS.diagram,
        run: () => this.insertBlock('mermaid'),
      });
    }
    return [...items, ...this.inlineItems()];
  }

  /** The chips and marks that go *into* a line — identical in a cell and a block. */
  private inlineItems(): SlashItem[] {
    const items: SlashItem[] = [
      {
        key: 'link',
        label: t('editor.slashLink'),
        keywords: 'link url href 링크',
        icon: ICONS.link,
        run: () => {
          this.mode = 'link';
          this.render();
        },
      },
      {
        key: 'code',
        label: t('editor.slashCode'),
        keywords: 'code mono inline 코드',
        icon: ICONS.code,
        // The class the inline-code tool emits, so code typed here and code
        // marked up from the toolbar are the same thing and look the same.
        run: () => this.insert('<code class="inline-code">&nbsp;</code>', 'inside'),
      },
    ];
    // In a block the image is a block of its own (offered above); in a cell it is
    // the only way to get a picture into a table, so it stays inline there.
    if (this.config.images && !this.inBlock) {
      items.push({
        key: 'image',
        label: t('editor.slashImage'),
        keywords: 'image picture photo upload 이미지',
        icon: ICONS.image,
        run: () => this.pickImage(),
      });
    }
    if (this.people().length) {
      items.push({
        key: 'mention',
        label: t('editor.slashMention'),
        keywords: 'mention person people user 멘션',
        icon: ICONS.mention,
        run: () => {
          this.mode = 'people';
          this.queryBase = this.query;
          this.active = 0;
          this.render();
        },
      });
    }
    items.push({
      key: 'date',
      label: t('editor.slashDate'),
      keywords: 'date day calendar today 날짜',
      icon: ICONS.date,
      run: () => {
        this.mode = 'date';
        this.month = new Date();
        this.render();
      },
    });
    return items;
  }

  private people(): SlashPerson[] {
    return this.config.people?.() ?? [];
  }

  private peopleItems(): SlashItem[] {
    return this.people().map((p) => ({
      key: p.id,
      label: p.name,
      keywords: p.email,
      icon: `<span class="rte-slash__avatar">${escapeHtml(initials(p.name, p.email))}</span>`,
      run: () =>
        this.insert(
          `<span class="rte-mention" data-user-id="${escapeHtml(p.id)}">@${escapeHtml(p.name)}</span>&nbsp;`,
          'after',
        ),
    }));
  }

  // ── Link ───────────────────────────────────────────────────────────────────

  private renderLink(root: HTMLElement) {
    root.appendChild(this.header(t('editor.slashLink')));
    const form = document.createElement('form');
    form.className = 'rte-slash__form';
    const input = document.createElement('input');
    // Deliberately `text`, not `url`: a bare `example.com` is exactly what people
    // paste, and `type="url"` would fail validation and swallow the Enter before
    // the submit handler (which adds the scheme) ever runs.
    input.type = 'text';
    input.inputMode = 'url';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.className = 'rte-slash__input';
    input.placeholder = t('editor.slashLinkPlaceholder');
    form.appendChild(input);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = input.value.trim();
      if (!url) return this.toRoot();
      const href = /^[a-z][a-z0-9+.-]*:|^\//i.test(url) ? url : `https://${url}`;
      this.insert(
        `<a href="${escapeHtml(href)}">${escapeHtml(url.replace(/^https?:\/\//, ''))}</a>&nbsp;`,
        'after',
      );
    });
    // The field is allowed to take focus — the text isn't edited while it's open,
    // so the stored text node and offset stay valid for `insert()` to write into.
    root.appendChild(form);
    window.setTimeout(() => input.focus(), 0);
  }

  // ── Date ───────────────────────────────────────────────────────────────────

  private renderDate(root: HTMLElement) {
    root.appendChild(this.header(t('editor.slashDate')));
    const wrap = document.createElement('div');
    wrap.className = 'rte-slash__cal';

    const head = document.createElement('div');
    head.className = 'rte-slash__cal-head';
    const label = document.createElement('span');
    label.textContent = this.month.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    const step = (delta: number) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-slash__cal-nav';
      btn.setAttribute('aria-label', delta < 0 ? t('editor.slashPrevMonth') : t('editor.slashNextMonth'));
      btn.innerHTML = icon(delta < 0 ? '<path d="m15 18-6-6 6-6"/>' : '<path d="m9 18 6-6-6-6"/>');
      btn.addEventListener('click', () => {
        this.month = new Date(this.month.getFullYear(), this.month.getMonth() + delta, 1);
        this.render();
      });
      return btn;
    };
    head.append(step(-1), label, step(1));
    wrap.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'rte-slash__cal-grid';
    const first = new Date(this.month.getFullYear(), this.month.getMonth(), 1);
    // Monday-first, matching the rest of the app's date UI.
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 0).getDate();
    const today = isoDay(new Date());
    for (let i = 0; i < lead; i++) grid.appendChild(document.createElement('span'));
    for (let d = 1; d <= days; d++) {
      const date = new Date(this.month.getFullYear(), this.month.getMonth(), d);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `rte-slash__day${isoDay(date) === today ? ' is-today' : ''}`;
      cell.textContent = String(d);
      cell.addEventListener('click', () => {
        this.insert(
          `<span class="rte-date" data-date="${isoDay(date)}">${escapeHtml(formatDate(date))}</span>&nbsp;`,
          'after',
        );
      });
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    root.appendChild(wrap);
    this.position();
  }

  // ── Image ──────────────────────────────────────────────────────────────────

  private pickImage() {
    const host = this.host;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file || !host) return;
      // The placeholder is written without telling the editor: an upload that
      // fails must not leave "Uploading…" behind in a saved document.
      const mark = this.insert(
        `<span class="rte-uploading" contenteditable="false">${escapeHtml(t('editor.uploading'))}</span>`,
        'after',
        false,
      );
      try {
        const url = await toUrl(file);
        const img = document.createElement('img');
        img.src = url;
        img.alt = file.name;
        mark?.replaceWith(img);
        this.config.onChange?.();
      } catch (e) {
        mark?.remove();
        toast.error((e as Error)?.message || t('editor.uploadFailed'));
      }
    });
    input.click();
    this.close();
  }

  // ── Writing into the document ──────────────────────────────────────────────

  /** Take the `/query` back out of the text. Returns false if the anchor is gone. */
  private consumeQuery(): boolean {
    const node = this.anchorNode;
    if (!node || !this.host) return false;
    const range = document.createRange();
    range.setStart(node, this.anchorStart);
    range.setEnd(node, Math.min(this.anchorStart + 1 + this.query.length, node.length));
    range.deleteContents();
    return true;
  }

  /**
   * Swap the `/query` for `html`. The only method here that touches the text, so
   * it is also the only place that has to worry about the caret: `inside` lands
   * it in the new node (a list item, a code span), `after` past it.
   */
  private insert(html: string, caret: 'inside' | 'after', notify = true): HTMLElement | null {
    const node = this.anchorNode;
    const host = this.host;
    if (!node || !host || !this.consumeQuery()) {
      this.close();
      return null;
    }
    this.busy = true;
    const range = document.createRange();
    range.setStart(node, this.anchorStart);
    range.collapse(true);
    const fragment = range.createContextualFragment(html);
    const first = fragment.firstElementChild as HTMLElement | null;
    const last = fragment.lastChild;
    range.insertNode(fragment);

    const target = caret === 'inside' ? (first?.querySelector('li') ?? first) : null;
    const sel = window.getSelection();
    const next = document.createRange();
    if (target) {
      // *After* the `&nbsp;` the item was seeded with. Chrome reads the start of
      // an element as a position before it and would type outside an inline
      // `<code>`; the end is unambiguously inside. `trimSeedPad` then drops the
      // padding as soon as there's real text, so nothing is indented by a space.
      next.selectNodeContents(target);
      next.collapse(false);
      trimSeedPad(host, target);
    } else if (last) {
      next.setStartAfter(last);
      next.collapse(true);
    }
    host.focus();
    sel?.removeAllRanges();
    sel?.addRange(next);

    this.close();
    this.busy = false;
    if (notify) this.config.onChange?.();
    return first;
  }

  /**
   * Make a block of `type`. The `/query` comes out of the line first, and what's
   * left of that line decides where the block goes: nothing left means the user
   * started an empty line with `/`, so the new block *replaces* it; otherwise it
   * lands after, leaving what was already written alone.
   */
  private insertBlock(type: string, data?: Record<string, unknown>) {
    const editor = this.config.editor;
    const host = this.host;
    if (!editor || !host || !this.consumeQuery()) return this.close();
    this.busy = true;
    const index = editor.blocks.getCurrentBlockIndex();
    const replace = !host.textContent?.trim();
    const at = replace ? index : index + 1;
    this.close();
    // Next tick: the caret and the block's own model settle after the deletion
    // above, and Editor.js reads both when it inserts.
    window.setTimeout(() => {
      try {
        editor.blocks.insert(type, data, undefined, at, true, replace);
        // `needToFocus` only moves Editor.js's *current block* pointer — it does
        // not put the caret in the DOM, and replacing a block blurs the editable
        // that had it. Without this the new block appears and the next thing
        // typed goes nowhere.
        //
        // A block with nothing to type into — a divider, an image still waiting
        // for its file — gets the caret on the line *after* it instead. Focusing
        // it merely selects it, and in Editor.js the next keystroke then
        // overwrites the selected block: the author would have watched the
        // divider they just made disappear as they carried on typing. An empty
        // paragraph is dropped on save, so the fallback costs the document
        // nothing if they walk away.
        if (editor.blocks.getBlockByIndex(at)?.focusable) {
          editor.caret.setToBlock(at, 'start');
        } else {
          editor.blocks.insert('paragraph', undefined, undefined, at + 1, true);
          editor.caret.setToBlock(at + 1, 'start');
        }
      } catch {
        // A tool that refuses the data is not worth an exception in the page —
        // the `/query` is already gone, so the line is just left as it was.
      }
      this.busy = false;
      this.config.onChange?.();
    }, 0);
  }

  // ── Keys ───────────────────────────────────────────────────────────────────

  private onKeyDown(e: KeyboardEvent) {
    // Editor.js opens its own toolbox when `/` is typed on an empty block. Let
    // the character through — the menu is driven by what's in the text — but stop
    // the event before its handler runs, or the same keystroke would open two
    // different menus on top of each other.
    if (
      !this.isOpen &&
      this.inBlock &&
      e.key === '/' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.isComposing
    ) {
      const node = window.getSelection()?.anchorNode;
      if (node && this.scope?.contains(node) && this.hostFor(node)) e.stopPropagation();
      return;
    }
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.mode === 'root') this.close();
      else this.toRoot();
      return;
    }
    // The URL field owns its keys, and the caret sits in it rather than in the
    // text, so nothing typed there can reach the editor anyway.
    if (this.mode === 'link') return;
    // The calendar has no list to walk, but the caret *is* still in the text —
    // so Enter would split the block (or add a table row) and Tab would jump
    // behind it. Take both; Enter picks today, the day it already highlights.
    if (this.mode === 'date') {
      if (e.key !== 'Enter' && e.key !== 'Tab') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Enter') this.root?.querySelector<HTMLElement>('.rte-slash__day.is-today')?.click();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const n = this.items.length;
      if (!n) return;
      this.setActive((this.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      // Enter would split the block or add a table row, and Tab would jump a
      // cell — both belong to the menu while it's open, so nothing downstream may
      // see them. That holds when nothing matched what was typed too: the
      // keypress dismisses the menu rather than quietly changing the document.
      e.preventDefault();
      e.stopImmediatePropagation();
      const item = this.items[this.active];
      if (item) item.run();
      else this.close();
    }
  }
}

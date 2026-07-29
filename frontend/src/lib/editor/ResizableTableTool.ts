// The Editor.js table, with **drag-to-resize columns and rows** — the piece the
// stock `@editorjs/table` never offered.
//
// It *subclasses* the stock tool rather than replacing it, because everything
// else about that table (the add/delete row+column toolboxes, cell selection,
// Tab navigation, the header-row machinery, paste) is worth keeping and is a lot
// of behaviour to re-earn. What this adds: two drag handles, a **header column**
// to go with the stock header row, and three extra fields on the saved data.
//
// Sizes survive the HTML round-trip (`lib/editorjs.ts`) as the markup a table
// already has for the job: `<colgroup><col style="width:%">` for columns and
// `<tr style="height:px">` for rows, plus an inline `table-layout:fixed` so the
// widths are authoritative wherever the stored HTML is displayed — read views
// and public share pages included, with no CSS for them to opt into.
//
// Two things about the stock tool constrain where the handles can live:
//  · `numberOfRows` is `.tc-table`'s `childElementCount` and `getRow()` is an
//    `:nth-child()` — so an extra child of `.tc-table` *is* a phantom row.
//    Column handles go in an overlay on `.tc-wrap` instead.
//  · `getData()` reads `.tc-cell` innerHTML — so a handle inside a cell would be
//    saved as table content. Row handles are appended to `.tc-row` itself, which
//    is queried by class and doesn't mind.
import Table from '@editorjs/table';
import type { API, BlockAPI, SanitizerConfig } from '@editorjs/editorjs';
import { t } from '@/i18n';
import { SlashMenu, type SlashMenuConfig } from './SlashMenu';
import { INLINE_SANITIZE } from './sanitize';

/** Percent of the table width. Narrow enough to be useful, wide enough to grab. */
const MIN_COL_PCT = 5;
/** Pixels. Roughly one line of text plus the cell's padding. */
const MIN_ROW_PX = 28;
/** Keyboard nudge — % for a column, px for a row. */
const KEY_COL_STEP = 2;
const KEY_ROW_STEP = 8;
/** How far into a checklist item the tick box reaches — see `wireCellTools`. */
const CHECK_HIT_PX = 22;

export interface ResizableTableData {
  /** First **row** is a header. The stock tool's own field — its name is fixed. */
  withHeadings: boolean;
  /**
   * First **column** is a header — the mirror image, which the stock tool has no
   * idea about. Absent rather than `false` when off, so turning it on is the only
   * thing that ever writes it into a document.
   */
  withHeadingsColumn?: boolean;
  stretched?: boolean;
  content: string[][];
  /**
   * Column widths as percentages of the table width, summing to 100. Absent
   * until the first drag — an untouched table keeps the stock equal columns, so
   * existing documents are not rewritten just by being opened.
   */
  colWidths?: number[];
  /** Row heights in px, index-aligned with `content`. `0` = natural height. */
  rowHeights?: number[];
}

/** The bits of the stock tool's internal `Table` this needs to reach. */
interface TableInternals {
  wrapper: HTMLElement;
  table: HTMLElement;
  numberOfRows: number;
  numberOfColumns: number;
  addColumn(index?: number, setFocus?: boolean): void;
  deleteColumn(index: number): void;
  addRow(index?: number, setFocus?: boolean): HTMLElement;
  deleteRow(index: number): void;
  /** Toggles `tc-table--heading` and the first row's placeholder attributes. */
  setHeadingsSetting(withHeadings: boolean): void;
}

/** Marks the first column as a header — the column half of `tc-table--heading`. */
const HEAD_COL_CLASS = 'rte-table--headcol';

/** Scale widths so they sum to exactly 100 — every column stays proportional. */
function normalize(widths: number[]): number[] {
  const total = widths.reduce((a, b) => a + b, 0);
  if (!total) return widths.map(() => 100 / widths.length);
  return widths.map((w) => (w / total) * 100);
}

/** Round for storage: one decimal is finer than any screen, and keeps HTML short. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Arrows pushing out to two edges — "make this exactly as wide as the page". */
const FIT_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4v16"/><path d="M21 4v16"/><path d="M8 9 5 12l3 3"/><path d="m16 9 3 3-3 3"/><path d="M5 12h14"/></svg>';

/**
 * A little table with one band filled — the same drawing twice, rotated. The
 * pair is what makes the two settings read as two halves of one idea rather
 * than as unrelated switches.
 */
const HEAD_ROW_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 4h16v5H4z" fill="currentColor"/><path d="M4 4h16v16H4z"/><path d="M4 9h16M4 14.5h16M12 9v11"/></svg>';
const HEAD_COL_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 4h5v16H4z" fill="currentColor"/><path d="M4 4h16v16H4z"/><path d="M9 4v16M14.5 4v16M9 12h11"/></svg>';

export class ResizableTableTool extends Table {
  /**
   * What a cell is allowed to hold once the `/` menu can put things in it. The
   * stock tool declares no `sanitize` at all, which leaves cell content on
   * Editor.js's inline-tool defaults — enough for bold and links, but a list, an
   * image or a mention chip would be stripped on save and the user would watch
   * their content vanish. Everything the menu can insert is listed here, and
   * nothing else: the whitelist is the security boundary for pasted HTML too.
   */
  static get sanitize(): Record<string, SanitizerConfig> {
    return {
      // Only `content` is listed: every other field of a table is a boolean or a
      // number, and the sanitizer walks strings only.
      content: {
        // The inline markup every text block keeps…
        ...INLINE_SANITIZE,
        // …plus the three things the cell's `/` menu can insert that a
        // paragraph can't: a list, a checklist item's tick, an image.
        ul: { class: true },
        ol: { class: true },
        li: { 'data-checked': true },
        img: { src: true, alt: true, width: true, height: true },
      },
    };
  }

  private colWidths: number[] | null = null;
  private rowHeights: number[] | null = null;
  /**
   * Held on the instance rather than in `this.data`, because the stock tool
   * *replaces* `this.data` wholesale when a table is pasted in — anything of ours
   * living in there would be dropped on the floor by that assignment.
   */
  private headingColumn = false;
  private overlay: HTMLElement | null = null;
  /** Set while a handle is being dragged, to suppress handle rebuilds mid-gesture. */
  private dragging = false;
  private slash: SlashMenu | null = null;

  constructor(opts: {
    data?: Partial<ResizableTableData>;
    config?: SlashMenuConfig & { rows?: number; cols?: number; withHeadings?: boolean };
    api: API;
    readOnly?: boolean;
    block?: BlockAPI;
  }) {
    super(opts as never);
    if (!opts.readOnly) {
      const { people, images } = opts.config ?? {};
      this.slash = new SlashMenu({ host: 'cell', people, images, onChange: () => this.changed() });
    }
    const { colWidths, rowHeights, withHeadingsColumn } = opts.data ?? {};
    this.headingColumn = !!withHeadingsColumn;
    // Only trust a full, sane set — a partial array would mis-size every column
    // after the gap.
    if (Array.isArray(colWidths) && colWidths.length > 1 && colWidths.every((w) => w > 0)) {
      this.colWidths = normalize(colWidths);
    }
    if (Array.isArray(rowHeights) && rowHeights.some((h) => h > 0)) {
      this.rowHeights = rowHeights.map((h) => (h > 0 ? h : 0));
    }
  }

  render(): HTMLDivElement {
    const container = super.render() as HTMLDivElement;
    // The stock render() builds a fresh internal table each time (onPaste calls
    // it again), so everything below re-attaches to the new DOM.
    this.applyColWidths();
    this.applyRowHeights();
    this.applyHeadingColumn();
    if (!this.isReadOnly()) {
      this.patchStructuralMethods();
      this.syncHandles();
      this.wireCellTools();
    }
    return container;
  }

  /**
   * The block's settings menu: **Header row**, **Header column**, **Fit to
   * width**.
   *
   * Written from scratch instead of appending to the stock tool's list, for two
   * reasons. The stock list spends *two* entries on one boolean ("With headings"
   * and "Without headings", only one ever active), which would have become four
   * entries once the column got the same treatment — a menu that lists every
   * state instead of every choice. And its third entry, "Stretch", writes an
   * Editor.js block tune that this app never stores: the document is saved as
   * HTML (`lib/editorjs`), which has nowhere to put it, so stretching a table
   * silently un-stretched itself on reload. Two honest toggles are better than
   * four entries and a lie.
   *
   * **Fit to width**: a table can end up wider than the page in two ordinary
   * ways — a column got dragged out, or there are simply more columns than the
   * stock `minmax(10%, 1fr)` track list can fit. Either way the wrapper starts
   * scrolling sideways and the table stops reading as part of the page. This puts
   * it back: every column an equal share of exactly 100%. It writes real widths
   * rather than clearing them, because that is also what makes the *stored* HTML
   * fit — `lib/editorjs` only emits the `<colgroup>` and `table-layout: fixed`
   * when there are widths to emit, so a read view and a public share page get the
   * same table the author fitted.
   */
  renderSettings(): unknown[] {
    return [
      {
        icon: HEAD_ROW_ICON,
        label: t('editor.tableHeaderRow'),
        toggle: true,
        isActive: this.headingRow,
        closeOnActivate: false,
        onActivate: () => this.setHeadingRow(!this.headingRow),
      },
      {
        icon: HEAD_COL_ICON,
        label: t('editor.tableHeaderColumn'),
        toggle: true,
        isActive: this.headingColumn,
        closeOnActivate: false,
        onActivate: () => this.setHeadingColumn(!this.headingColumn),
      },
      {
        icon: FIT_ICON,
        label: t('editor.tableFitWidth'),
        closeOnActivate: true,
        onActivate: () => this.fitToWidth(),
      },
    ];
  }

  // ── Headers ────────────────────────────────────────────────────────────────

  /** The stock tool's own flag, which only it may write. */
  private get headingRow(): boolean {
    return !!(this as unknown as { data?: ResizableTableData }).data?.withHeadings;
  }

  /**
   * Delegated to the stock tool, which does more than add a class: it also puts
   * the "Heading" placeholder attribute on the first row's cells (and takes it
   * off again), so an empty header row still says what it is.
   */
  private setHeadingRow(on: boolean) {
    const data = (this as unknown as { data?: ResizableTableData }).data;
    if (data) data.withHeadings = on;
    this.internals?.setHeadingsSetting?.(on);
    this.changed();
  }

  private setHeadingColumn(on: boolean) {
    this.headingColumn = on;
    this.applyHeadingColumn();
    this.changed();
  }

  /** One class on `.tc-table`, mirroring the stock `tc-table--heading`. */
  private applyHeadingColumn() {
    this.tableEl?.classList.toggle(HEAD_COL_CLASS, this.headingColumn);
  }

  /** Equal columns summing to 100% — the table is exactly as wide as the page. */
  private fitToWidth() {
    const n = this.columnCount();
    if (n < 2) return;
    this.colWidths = Array.from({ length: n }, () => 100 / n);
    this.applyColWidths();
    this.syncHandles();
    this.changed();
  }

  /**
   * Editor.js calls this when the block goes away. The stock tool may or may not
   * define it depending on version, hence the guarded call — what matters here is
   * that the `/` menu's document-level listener doesn't outlive the table.
   */
  destroy() {
    this.slash?.destroy();
    (Table.prototype as { destroy?: () => void }).destroy?.call(this);
  }

  save(): ResizableTableData {
    const saved = super.save() as ResizableTableData;
    // `getData()` drops entirely-empty rows, so heights are collected through the
    // same filter — otherwise every height after a blank row shifts up by one.
    const heights = this.collectRowHeights();
    return {
      ...saved,
      ...(this.headingColumn ? { withHeadingsColumn: true } : {}),
      ...(this.colWidths ? { colWidths: this.colWidths.map(round1) } : {}),
      ...(heights.some((h) => h > 0) ? { rowHeights: heights } : {}),
    };
  }

  // ── DOM access ─────────────────────────────────────────────────────────────

  private get internals(): TableInternals | null {
    return (this as unknown as { table?: TableInternals }).table ?? null;
  }
  private get tableEl(): HTMLElement | null {
    return this.internals?.table ?? null;
  }
  private get wrapEl(): HTMLElement | null {
    return this.internals?.wrapper ?? null;
  }
  private isReadOnly(): boolean {
    return !!(this as unknown as { readOnly?: boolean }).readOnly;
  }
  private rows(): HTMLElement[] {
    return Array.from(this.tableEl?.querySelectorAll<HTMLElement>(':scope > .tc-row') ?? []);
  }
  private cellsIn(row: HTMLElement): HTMLElement[] {
    return Array.from(row.querySelectorAll<HTMLElement>(':scope > .tc-cell'));
  }
  private columnCount(): number {
    const first = this.rows()[0];
    return first ? this.cellsIn(first).length : 0;
  }
  private changed() {
    (this as unknown as { block?: BlockAPI }).block?.dispatchChange?.();
  }

  // ── Applying sizes ─────────────────────────────────────────────────────────

  /** Current widths in %, falling back to the equal split the stock table uses. */
  private effectiveWidths(): number[] {
    const n = this.columnCount();
    if (this.colWidths?.length === n) return [...this.colWidths];
    return Array.from({ length: n }, () => 100 / n);
  }

  /**
   * Every `.tc-row` is its own grid, so the widths go on `.tc-table` as a custom
   * property the rows inherit — one write instead of one per row, and the stock
   * `repeat(auto-fit, …)` stays the default for tables nobody has resized.
   */
  private applyColWidths() {
    const el = this.tableEl;
    if (!el) return;
    if (this.colWidths?.length) {
      el.style.setProperty('--rte-cols', this.colWidths.map((w) => `${round1(w)}%`).join(' '));
      el.classList.add('rte-table--sized');
    } else {
      el.style.removeProperty('--rte-cols');
      el.classList.remove('rte-table--sized');
    }
  }

  /** `min-height`, not `height`: a row may never be shorter than its own text. */
  private applyRowHeights() {
    if (!this.rowHeights) return;
    this.rows().forEach((row, i) => {
      const h = this.rowHeights?.[i] ?? 0;
      row.style.minHeight = h > 0 ? `${h}px` : '';
    });
  }

  private collectRowHeights(): number[] {
    const out: number[] = [];
    this.rows().forEach((row) => {
      // Mirror `getData()`: a row with nothing in any cell is not saved at all.
      const cells = this.cellsIn(row);
      if (cells.length && cells.every((c) => !c.textContent?.trim())) return;
      out.push(Math.round(parseFloat(row.style.minHeight) || 0));
    });
    return out;
  }

  // ── Handles ────────────────────────────────────────────────────────────────

  /**
   * Rebuild both sets of handles for the current shape. Cheap, and called after
   * anything that changes the row/column count.
   */
  private syncHandles() {
    if (this.dragging) return;
    this.syncColumnHandles();
    this.syncRowHandles();
  }

  private syncColumnHandles() {
    const wrap = this.wrapEl;
    if (!wrap) return;
    if (!this.overlay) {
      // On `.tc-wrap`, never on `.tc-table` — see the note at the top of the file.
      this.overlay = document.createElement('div');
      this.overlay.className = 'rte-table-cols';
      this.overlay.setAttribute('contenteditable', 'false');
      wrap.appendChild(this.overlay);
    } else if (this.overlay.parentElement !== wrap) {
      wrap.appendChild(this.overlay);
    }
    this.overlay.innerHTML = '';

    // A handle sits on each *inner* boundary; the table's right edge is the
    // document's, not a column's, so the last column has nothing to drag.
    const widths = this.effectiveWidths();
    let cumulative = 0;
    for (let i = 0; i < widths.length - 1; i++) {
      cumulative += widths[i];
      const handle = this.makeHandle('col', t('editor.resizeColumn'));
      handle.style.left = `${cumulative}%`;
      this.attachColumnDrag(handle, i);
      this.overlay.appendChild(handle);
    }
  }

  private syncRowHandles() {
    this.rows().forEach((row, i) => {
      row.querySelector(':scope > .rte-table-handle')?.remove();
      const handle = this.makeHandle('row', t('editor.resizeRow'));
      this.attachRowDrag(handle, row, i);
      // Appended, never prepended: the stock tool finds a row's first cell with
      // `.tc-cell:first-child`.
      row.appendChild(handle);
    });
  }

  private makeHandle(kind: 'col' | 'row', label: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `rte-table-handle rte-table-handle--${kind}`;
    el.setAttribute('contenteditable', 'false');
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-label', label);
    el.title = label;
    el.tabIndex = 0;
    return el;
  }

  /**
   * Shared pointer plumbing: claim the gesture before Editor.js reads it as a
   * block drag or the table as a cell selection, then track to the window so the
   * pointer can leave the handle mid-drag.
   */
  private drag(
    handle: HTMLElement,
    onStart: (e: PointerEvent) => void,
    onMove: (e: PointerEvent) => void,
  ) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dragging = true;
      onStart(e);
      handle.classList.add('is-dragging');
      handle.setPointerCapture?.(e.pointerId);
      const move = (ev: PointerEvent) => onMove(ev);
      const up = (ev: PointerEvent) => {
        handle.releasePointerCapture?.(ev.pointerId);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        handle.classList.remove('is-dragging');
        this.dragging = false;
        this.syncHandles();
        this.changed();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  /** Boundary `index` separates column `index` from column `index + 1`. */
  private attachColumnDrag(handle: HTMLElement, index: number) {
    let startX = 0;
    let start: number[] = [];
    let tableW = 1;

    const resize = (deltaPx: number) => {
      const widths = [...start];
      const pair = widths[index] + widths[index + 1];
      // The pair's total is fixed, so the table never grows or shrinks — the
      // boundary just moves, exactly like dragging a spreadsheet's gridline.
      const next = Math.min(
        pair - MIN_COL_PCT,
        Math.max(MIN_COL_PCT, widths[index] + (deltaPx / tableW) * 100),
      );
      widths[index] = next;
      widths[index + 1] = pair - next;
      this.colWidths = widths;
      this.applyColWidths();
      handle.style.left = `${widths.slice(0, index + 1).reduce((a, b) => a + b, 0)}%`;
    };

    this.drag(
      handle,
      (e) => {
        startX = e.clientX;
        start = this.effectiveWidths();
        tableW = this.tableEl?.getBoundingClientRect().width || 1;
      },
      (e) => resize(e.clientX - startX),
    );

    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      start = this.effectiveWidths();
      tableW = this.tableEl?.getBoundingClientRect().width || 1;
      resize(((e.key === 'ArrowLeft' ? -KEY_COL_STEP : KEY_COL_STEP) / 100) * tableW);
      this.changed();
    });
  }

  private attachRowDrag(handle: HTMLElement, row: HTMLElement, index: number) {
    let startY = 0;
    let startH = 0;

    const resize = (deltaPx: number) => {
      const h = Math.max(MIN_ROW_PX, Math.round(startH + deltaPx));
      row.style.minHeight = `${h}px`;
      const heights = this.rows().map((r) => Math.round(parseFloat(r.style.minHeight) || 0));
      heights[index] = h;
      this.rowHeights = heights;
    };

    this.drag(
      handle,
      (e) => {
        startY = e.clientY;
        startH = row.getBoundingClientRect().height;
      },
      (e) => resize(e.clientY - startY),
    );

    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      startH = row.getBoundingClientRect().height;
      resize(e.key === 'ArrowUp' ? -KEY_ROW_STEP : KEY_ROW_STEP);
      this.changed();
    });
  }

  // ── What a cell can hold ───────────────────────────────────────────────────

  /**
   * The `/` menu, plus the one thing it inserts that stays interactive: a
   * checklist item. Both are wired to the wrapper rather than to each cell, so
   * they survive every add/delete row and column without re-attaching.
   */
  private wireCellTools() {
    const wrap = this.wrapEl;
    if (!wrap) return;
    this.slash?.bind(wrap);
    if ((wrap as { __rteCells?: boolean }).__rteCells) return;
    (wrap as { __rteCells?: boolean }).__rteCells = true;

    // Click the box, not the text: a checklist item is an ordinary editable line,
    // so only the marker strip toggles it — measured off the item's own left edge
    // so it doesn't matter which inner node the click actually landed on.
    wrap.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest?.('.rte-check > li') as HTMLElement | null;
      if (!li || e.clientX - li.getBoundingClientRect().left > CHECK_HIT_PX) return;
      li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
      this.changed();
    });
  }

  // ── Keeping sizes aligned when the table's shape changes ───────────────────

  /**
   * The add/delete buttons live in the stock toolboxes, so the only way to learn
   * *where* a row or column went is to wrap the methods they call. Patched on the
   * instance, so other tables on the page are untouched.
   *
   * A table nobody has resized is left alone entirely: equal columns and natural
   * rows already adapt to any shape, and materialising an array here would start
   * writing sizes into documents that never asked for them.
   */
  private patchStructuralMethods() {
    const tbl = this.internals;
    if (!tbl || (tbl as unknown as { __rteSized?: boolean }).__rteSized) return;
    (tbl as unknown as { __rteSized?: boolean }).__rteSized = true;

    // Indices from the stock tool are 1-based, and insert *before* the given
    // column/row; anything out of range (its default `-1`) means append.
    const at = (index: number | undefined, count: number) =>
      index !== undefined && index > 0 && index <= count ? index - 1 : count;

    // The widths are read *before* the call — afterwards `effectiveWidths()` sees
    // the new column count, disagrees with the stored array and hands back an
    // equal split, which then gets one more entry spliced into it.
    const addColumn = tbl.addColumn.bind(tbl);
    tbl.addColumn = (index?: number, setFocus?: boolean) => {
      const before = this.columnCount();
      const widths = this.colWidths ? this.effectiveWidths() : null;
      addColumn(index, setFocus);
      if (widths && this.columnCount() > before) {
        widths.splice(at(index, before), 0, 100 / (before + 1));
        this.colWidths = normalize(widths);
        this.applyColWidths();
      }
      this.syncHandles();
    };

    const deleteColumn = tbl.deleteColumn.bind(tbl);
    tbl.deleteColumn = (index: number) => {
      const before = this.columnCount();
      const widths = this.colWidths ? this.effectiveWidths() : null;
      deleteColumn(index);
      if (widths && this.columnCount() < before) {
        widths.splice(at(index, before), 1);
        // Down to a single column there is no boundary left to drag, so the
        // custom widths are dropped rather than kept as a dormant 100%.
        this.colWidths = widths.length > 1 ? normalize(widths) : null;
        this.applyColWidths();
      }
      this.syncHandles();
    };

    const addRow = tbl.addRow.bind(tbl);
    tbl.addRow = (index?: number, setFocus?: boolean) => {
      const before = this.rows().length;
      const row = addRow(index, setFocus);
      if (this.rowHeights) this.rowHeights.splice(at(index, before), 0, 0);
      this.syncHandles();
      return row;
    };

    const deleteRow = tbl.deleteRow.bind(tbl);
    tbl.deleteRow = (index: number) => {
      const before = this.rows().length;
      deleteRow(index);
      if (this.rowHeights) this.rowHeights.splice(at(index, before), 1);
      this.syncHandles();
    };
  }
}

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { localeTag, t } from '@/i18n';
import { formatDate } from '@/lib/format';

/** One day in ms — exported so adapters can derive fallback end dates (+N days). */
export const GANTT_DAY = 86_400_000;

// ── The label rail ───────────────────────────────────────────────────────────
// Column 0 is **frozen**: it's `sticky left-0` inside the horizontal scroller, so
// scrolling the axis never leaves you looking at unlabelled bars. Its width is
// therefore not a constant any more — it's dragged from the header's right edge
// and remembered per browser, because what belongs there is a title, and titles
// run from "Login" to a full user story. Every place that needs the width reads
// the state (inline styles, not Tailwind classes, which can't take a JS value).
const RAIL_KEY = 'ph_gantt_rail_w';
const RAIL_DEFAULT = 200;
const RAIL_MIN = 120;
const RAIL_MAX = 520;
/** How much the timeline track keeps for itself — the chart scrolls below this. */
const TRACK_MIN = 560;
/** Keyboard resize step (the rail is a focusable separator). */
const RAIL_STEP = 16;

const clampRail = (n: number) => Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(n)));
function readRail(): number {
  try {
    const raw = Number(localStorage.getItem(RAIL_KEY));
    return raw ? clampRail(raw) : RAIL_DEFAULT;
  } catch {
    return RAIL_DEFAULT;
  }
}
function writeRail(w: number) {
  try {
    localStorage.setItem(RAIL_KEY, String(w));
  } catch {
    /* ignore */
  }
}

/** ISO date → epoch ms, or NaN when unset/invalid. */
export const toEpoch = (d?: string | null): number => (d ? new Date(d).getTime() : NaN);
export const isEpoch = (n: number): boolean => !Number.isNaN(n);
/** First of the given ISO dates that's actually set, as epoch ms — or NaN. */
export function firstEpoch(...dates: (string | undefined | null)[]): number {
  for (const d of dates) {
    const m = toEpoch(d);
    if (isEpoch(m)) return m;
  }
  return NaN;
}

interface Tick {
  x: number;
  label: string;
}

/** Axis ticks across the padded window: weekly for short spans, monthly for long
 *  ones — keeps the header readable whether the window is two weeks or two quarters. */
function buildTicks(minMs: number, maxMs: number): Tick[] {
  const pct = (v: number) => ((v - minMs) / (maxMs - minMs)) * 100;
  const ticks: Tick[] = [];
  const spanDays = (maxMs - minMs) / GANTT_DAY;
  if (spanDays <= 70) {
    const c = new Date(minMs);
    c.setHours(0, 0, 0, 0);
    if (c.getTime() < minMs) c.setDate(c.getDate() + 1);
    for (let d = c.getTime(); d <= maxMs; d += 7 * GANTT_DAY) {
      ticks.push({
        x: pct(d),
        label: new Date(d).toLocaleDateString(localeTag(), { month: 'short', day: 'numeric' }),
      });
    }
  } else {
    const c = new Date(minMs);
    c.setDate(1);
    c.setHours(0, 0, 0, 0);
    if (c.getTime() < minMs) c.setMonth(c.getMonth() + 1);
    while (c.getTime() <= maxMs) {
      ticks.push({
        x: pct(c.getTime()),
        label: c.toLocaleDateString(localeTag(), { month: 'short' }),
      });
      c.setMonth(c.getMonth() + 1);
    }
  }
  return ticks;
}

/** A span bar on the timeline (start → end). */
export interface GanttBar {
  start: number;
  end: number;
  color: string;
  /**
   * 0–100. When set, the bar is a translucent track with a solid fill to this %
   * and a trailing % label (the roadmap "progress" look). When omitted, the bar
   * is a solid block (the plain schedule look used by issue timelines).
   */
  progress?: number;
  tooltip?: string;
}

/** A single-date diamond marker on the timeline. */
export interface GanttMarker {
  at: number;
  color: string;
  tooltip?: string;
}

export interface GanttRow {
  id: string;
  label: string;
  /**
   * Secondary line under the label (e.g. "60% · 3 tasks"). A node rather than a
   * string so a row can lead with a chip — the all-roadmaps timeline names the
   * roadmap an item came from here. Keep whatever you pass **inline**: the line
   * is a `truncate` span, and a flex/block child would lose the ellipsis.
   */
  sublabel?: ReactNode;
  /** 0 = top-level, 1 = an indented child (e.g. a task under a roadmap item). */
  depth?: number;
  /**
   * Render this row as a **group heading** — a band over the rows that follow it
   * (a roadmap epic over its items) rather than a row of its own data. It can
   * still carry a bar: an epic's span *is* the span of the work under it.
   */
  heading?: boolean;
  /** Heading rows only: draws the fold chevron in this state. Leave undefined for
   *  a heading that can't be folded, and the chevron isn't drawn at all. */
  collapsed?: boolean;
  /** Leading dot before the label — a status/severity colour. */
  dotColor?: string;
  /** Click **anywhere in the row's rail cell** (opens a detail — usually a peek
   *  drawer); mutually exclusive with `href`. */
  onClick?: () => void;
  /** Make that whole cell a router link instead of a button. */
  href?: string;
  bar?: GanttBar;
  marker?: GanttMarker;
  /** Shown in the track when the row has neither a bar nor a marker. */
  emptyText?: string;
  /**
   * Makes this row's bar **draggable** (whole bar → shifts both dates) and
   * **resizable** (either edge → moves that date). Called once on release with
   * the new window, day-aligned; omit and the bar is read-only.
   *
   * The caller must reflect the change immediately (optimistically) — the bar
   * returns to its `bar` prop the moment the drag ends, so a slow round-trip
   * would look like a snap-back. Drag is pointer-only; the row's rail cell still
   * opens the detail, which is the keyboard/screen-reader path to the dates.
   */
  onBarChange?: (next: { start: number; end: number }) => void;
}

export interface GanttChartProps {
  rows: GanttRow[];
  /** Header for the fixed left label rail (e.g. "Item" / "Issue"). */
  labelHeader: string;
  /** Optional legend row above the chart explaining bars/markers. */
  legend?: ReactNode;
  isLoading?: boolean;
  /** Shown when there are no rows at all. */
  empty?: { title: string; hint?: string };
}

/**
 * A reusable timeline (Gantt) surface: a **frozen** label rail on the left and a
 * date axis filling the rest, with a "today" line, weekly/monthly gridlines, and
 * one row per item — each drawn as a span **bar**, a single-date **marker**, or a
 * plain listing when it has no dates. Callers own how rows are derived and
 * coloured (see `RoadmapGanttView` and `IssueTimelineView`); this component owns
 * only the axis, the window maths, and the row chrome.
 *
 * The rail sticks to the left edge while the axis scrolls under it, and its width
 * is draggable from the header's right edge (remembered per browser).
 *
 * A row that supplies `onBarChange` is also **editable**: its bar drags to a new
 * window and its edges resize, snapped to whole days.
 */
export function GanttChart({ rows, labelHeader, legend, isLoading, empty }: GanttChartProps) {
  const [railW, setRailW] = useState(readRail);
  const railDrag = useRef<{ x0: number; w0: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  const beginRailDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    railDrag.current = { x0: e.clientX, w0: railW };
    setResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveRailDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = railDrag.current;
    if (!d) return;
    setRailW(clampRail(d.w0 + (e.clientX - d.x0)));
  };
  const endRailDrag = () => {
    if (!railDrag.current) return;
    railDrag.current = null;
    setResizing(false);
    writeRail(railW);
  };
  /** Keyboard resize — the grip is a focusable separator, so arrows move it and
   *  Home restores the default. Pointer-only would leave it unreachable. */
  const railKeys = (e: ReactKeyboardEvent<HTMLElement>) => {
    const step = e.key === 'ArrowLeft' ? -RAIL_STEP : e.key === 'ArrowRight' ? RAIL_STEP : 0;
    const next = e.key === 'Home' ? RAIL_DEFAULT : step ? clampRail(railW + step) : null;
    if (next === null) return;
    e.preventDefault();
    setRailW(next);
    writeRail(next);
  };
  /** Two columns, sized from the state — used by the header and every row, so
   *  they can't drift out of lockstep the way the old literals could. */
  const cols = { gridTemplateColumns: `${railW}px minmax(0,1fr)` };

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm font-medium text-foreground">{empty?.title}</p>
        {empty?.hint && <p className="mt-1 text-sm text-muted-foreground">{empty.hint}</p>}
      </div>
    );
  }

  // Padded window covering every endpoint plus today, so the "today" line always lands.
  const stamps = [Date.now()];
  for (const r of rows) {
    if (r.bar) stamps.push(r.bar.start, r.bar.end);
    if (r.marker && isEpoch(r.marker.at)) stamps.push(r.marker.at);
  }
  let minMs = Math.min(...stamps);
  let maxMs = Math.max(...stamps);
  if (maxMs - minMs < 14 * GANTT_DAY) maxMs = minMs + 14 * GANTT_DAY; // never a hairline axis
  const pad = Math.max(2 * GANTT_DAY, (maxMs - minMs) * 0.05);
  minMs -= pad;
  maxMs += pad;

  const pct = (v: number) => Math.min(100, Math.max(0, ((v - minMs) / (maxMs - minMs)) * 100));
  const ticks = buildTicks(minMs, maxMs);
  const todayX = pct(Date.now());

  return (
    <div className="flex flex-col gap-3">
      {legend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div style={{ minWidth: railW + TRACK_MIN }}>
          {/* Axis header */}
          <div className="grid border-b" style={cols}>
            {/* The frozen rail's header — an opaque `bg-card` base under the row's
                muted tint, since the axis now scrolls *behind* it. */}
            <div className="sticky left-0 z-30 border-r bg-card">
              <div className="relative flex h-full items-center bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="min-w-0 truncate">{labelHeader}</span>
                <RailGrip
                  width={railW}
                  active={resizing}
                  onPointerDown={beginRailDrag}
                  onPointerMove={moveRailDrag}
                  onPointerUp={endRailDrag}
                  onPointerCancel={endRailDrag}
                  onKeyDown={railKeys}
                />
              </div>
            </div>
            <div className="relative h-8 bg-muted/40">
              {ticks.map((tk, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full items-center whitespace-nowrap px-1 text-[11px] tabular-nums text-muted-foreground"
                  style={{ left: `${tk.x}%` }}
                >
                  {tk.label}
                </div>
              ))}
              <div
                className="absolute top-0 -translate-x-1/2 rounded-b bg-foreground/80 px-1 text-[10px] font-medium text-background"
                style={{ left: `${todayX}%` }}
              >
                {t('boards.today')}
              </div>
            </div>
          </div>

          {/* Body: gridlines + today line sit behind the rows. */}
          <div className="relative">
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-0"
              style={{ left: railW }}
            >
              {ticks.map((tk, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 w-px bg-border/70"
                  style={{ left: `${tk.x}%` }}
                />
              ))}
              <div
                className="absolute inset-y-0 w-px bg-foreground/30"
                style={{ left: `${todayX}%` }}
              />
            </div>

            <div className="relative z-10">
              {rows.map((row) => (
                <GanttRowView key={row.id} row={row} cols={cols} pct={pct} spanMs={maxMs - minMs} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GanttRowView({
  row,
  cols,
  pct,
  spanMs,
}: {
  row: GanttRow;
  /** The chart's two column widths — the rail is resizable, so they're shared. */
  cols: { gridTemplateColumns: string };
  pct: (v: number) => number;
  spanMs: number;
}) {
  const heading = !!row.heading;
  const child = !heading && (row.depth ?? 0) > 0;
  const interactive = !!(row.href || row.onClick);

  const dot = row.dotColor ? (
    <span
      className={cn('shrink-0 rounded-full', heading ? 'size-2.5' : 'size-2')}
      style={{ backgroundColor: row.dotColor }}
      aria-hidden
    />
  ) : null;
  // Only a foldable heading gets a chevron — one that isn't foldable would be
  // offering a control that does nothing.
  const chevron =
    heading && row.collapsed !== undefined ? (
      <ChevronDown
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform',
          row.collapsed && '-rotate-90',
        )}
        aria-hidden
      />
    ) : null;
  // The title is plain text now: the *cell* around it is the link/button (see
  // below), and an anchor inside an anchor isn't a thing. Hover styling therefore
  // keys off the cell, not the glyph.
  const title = (
    <span
      className={cn(
        'min-w-0 flex-1 truncate',
        child
          ? 'text-xs text-muted-foreground'
          : heading
            ? 'text-sm font-semibold text-foreground'
            : 'text-sm font-medium text-foreground',
        interactive && 'group-hover/rail:underline',
        interactive && child && 'group-hover/rail:text-foreground',
      )}
      title={row.label}
    >
      {row.label}
    </span>
  );
  /** A child indents into a single flex row; a top-level row is a flex column so
   *  it can carry a sublabel line under the title. */
  const body = child ? (
    <>
      {dot}
      {title}
    </>
  ) : (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {chevron}
        {dot}
        {title}
      </div>
      {row.sublabel && (
        <span className="truncate text-[11px] text-muted-foreground">{row.sublabel}</span>
      )}
    </>
  );

  // **The whole rail cell opens the row**, not just the title glyph. The rail is
  // resizable and titles truncate, so most of a row is empty space beside its
  // text — clicking a row in the task list and having nothing happen is the bug
  // this fixes. One element wraps the lot (link, button, or inert div) rather
  // than a target per line, so there are no dead gaps left between them.
  const cellCls = cn(
    'flex min-w-0 flex-1',
    child ? 'items-center gap-2 py-1.5 pl-6 pr-3' : 'flex-col justify-center gap-0.5 px-3 py-2',
    interactive &&
      'text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
  );
  const cell = row.href ? (
    <Link to={row.href} className={cellCls}>
      {body}
    </Link>
  ) : row.onClick ? (
    <button type="button" onClick={row.onClick} className={cellCls}>
      {body}
    </button>
  ) : (
    <div className={cellCls}>{body}</div>
  );

  return (
    <div
      className={cn(
        'group grid items-center border-b last:border-0',
        // A heading sits on a band so the rows under it read as belonging to it.
        // Its fills stay fully opaque tokens, never a tint: the rail is frozen
        // over scrolling bars, and anything translucent lets them show through.
        heading ? 'bg-muted hover:bg-accent' : 'hover:bg-accent/30',
      )}
      style={cols}
    >
      {/* Label rail — frozen to the left edge, so it needs an opaque background of
          its own (the row's hover tint can't show through it, hence `group-hover`)
          and `self-stretch` to cover the row's full height as bars scroll under. */}
      <div
        className={cn(
          'group/rail sticky left-0 z-20 flex self-stretch border-r',
          heading ? 'bg-muted group-hover:bg-accent' : 'bg-card group-hover:bg-accent/30',
        )}
      >
        {cell}
      </div>

      {/* Timeline track — the drag maths measures this element to turn pixels
          into days, so a bar must stay a direct child of it. */}
      <div data-gantt-track className={cn('relative', row.bar ? 'h-10' : 'h-8')}>
        {row.bar ? (
          <GanttBarView bar={row.bar} pct={pct} spanMs={spanMs} onChange={row.onBarChange} />
        ) : row.marker && isEpoch(row.marker.at) ? (
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ring-2 ring-card"
            style={{ left: `${pct(row.marker.at)}%`, backgroundColor: row.marker.color }}
            title={row.marker.tooltip}
          />
        ) : row.emptyText ? (
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] italic text-muted-foreground/70">
            {row.emptyText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The rail's resize grip — a narrow hit zone straddling the header's right edge,
 * showing a brand line while pointed at or dragged. It's an ARIA `separator` with
 * a value, so the width is reachable by keyboard (arrows, Home) and announced,
 * not a pointer-only affordance.
 */
function RailGrip({
  width,
  active,
  ...handlers
}: {
  width: number;
  active: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <span
      {...handlers}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('boards.resizeColumn')}
      aria-valuenow={width}
      aria-valuemin={RAIL_MIN}
      aria-valuemax={RAIL_MAX}
      tabIndex={0}
      title={t('boards.resizeColumn')}
      // `touch-none` so a drag here resizes instead of scrolling the chart sideways.
      className="group/grip absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize touch-none outline-none"
    >
      <span
        className={cn(
          'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-primary transition-opacity',
          active
            ? 'opacity-100'
            : 'opacity-0 group-hover/grip:opacity-100 group-focus-visible/grip:opacity-100',
        )}
        aria-hidden
      />
    </span>
  );
}

/** What a pointer is currently doing to a bar, captured at pointer-down. */
interface BarDrag {
  /** Whole bar (both dates shift) vs one edge (that date moves). */
  mode: 'move' | 'start' | 'end';
  x0: number;
  start0: number;
  end0: number;
  /** Track scale — set once from the measured track, so the maths is stable. */
  msPerPx: number;
}

/**
 * One bar, optionally draggable. With `onChange` the body drags the whole window
 * and each edge resizes it; movement snaps to whole days (the dates behind a bar
 * are day-granular) and a floating label shows the dates as they change. The
 * preview lives here and clears on release — see `GanttRow.onBarChange`.
 */
function GanttBarView({
  bar,
  pct,
  spanMs,
  onChange,
}: {
  bar: GanttBar;
  pct: (v: number) => number;
  spanMs: number;
  onChange?: (next: { start: number; end: number }) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<BarDrag | null>(null);
  const latest = useRef<{ start: number; end: number } | null>(null);
  const [preview, setPreview] = useState<{ start: number; end: number } | null>(null);
  const editable = !!onChange;

  const view = preview ?? bar;
  const left = pct(view.start);
  const width = Math.max(1.5, pct(view.end) - left);
  const label = `${formatDate(new Date(view.start))} – ${formatDate(new Date(view.end))}`;

  const begin = (mode: BarDrag['mode']) => (e: ReactPointerEvent<HTMLElement>) => {
    const el = wrap.current;
    // Measure the track, not the bar: its width is the whole visible window.
    const w = el?.parentElement?.getBoundingClientRect().width ?? 0;
    // Pointer-drag is for a mouse/pen. On touch the chart scrolls sideways, and
    // claiming the gesture would trap a swipe that started on a bar — day-precise
    // dragging on a phone isn't worth losing the scroll.
    if (!onChange || !el || !w || e.button !== 0 || e.pointerType === 'touch') return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, x0: e.clientX, start0: bar.start, end0: bar.end, msPerPx: spanMs / w };
    latest.current = { start: bar.start, end: bar.end };
    el.setPointerCapture(e.pointerId); // keep receiving moves outside the bar
    setPreview(latest.current);
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const shift = Math.round(((e.clientX - d.x0) * d.msPerPx) / GANTT_DAY) * GANTT_DAY;
    // An edge never crosses the other one — a window can shrink to a single day.
    const next =
      d.mode === 'move'
        ? { start: d.start0 + shift, end: d.end0 + shift }
        : d.mode === 'start'
          ? { start: Math.min(d.start0 + shift, d.end0), end: d.end0 }
          : { start: d.start0, end: Math.max(d.end0 + shift, d.start0) };
    latest.current = next;
    setPreview(next);
  };

  const finish = () => {
    const d = drag.current;
    const next = latest.current;
    drag.current = null;
    latest.current = null;
    setPreview(null);
    // A click that moved nothing is not an edit.
    if (d && next && (next.start !== d.start0 || next.end !== d.end0)) onChange?.(next);
  };

  // With a progress value: a translucent track + solid fill + trailing % (roadmap
  // look). Without: a single solid block (plain schedule look).
  const fill =
    bar.progress == null ? (
      <span className="absolute inset-0 rounded-md" style={{ backgroundColor: bar.color }} />
    ) : (
      <>
        <span
          className="absolute inset-0 rounded-md"
          style={{ backgroundColor: bar.color, opacity: 0.18 }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-md"
          style={{ width: `${bar.progress}%`, backgroundColor: bar.color }}
        />
        {width > 12 && (
          <span className="absolute right-0 top-1/2 -translate-y-1/2 pr-1.5 text-[10px] font-medium tabular-nums text-foreground/70">
            {bar.progress}%
          </span>
        )}
      </>
    );

  // Edge handles need room to leave a draggable middle — a sliver of a bar stays
  // move-only rather than becoming two handles with nothing between them.
  const roomy = width >= 4;

  return (
    <div
      ref={wrap}
      className={cn(
        'group absolute top-1/2 h-4 -translate-y-1/2',
        editable && 'cursor-grab active:cursor-grabbing',
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={bar.tooltip ?? label}
      onPointerDown={editable ? begin('move') : undefined}
      onPointerMove={editable ? onMove : undefined}
      onPointerUp={editable ? finish : undefined}
      onPointerCancel={editable ? finish : undefined}
    >
      {fill}
      {editable && roomy && (
        <>
          <BarHandle side="start" onPointerDown={begin('start')} />
          <BarHandle side="end" onPointerDown={begin('end')} />
        </>
      )}
      {preview && (
        <span className="absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-background shadow">
          {label}
        </span>
      )}
    </div>
  );
}

/** A resize grip at one end of a bar — an 8px hit zone showing a grab line on
 *  hover, so a read-only bar and an editable one look the same until pointed at. */
function BarHandle({
  side,
  onPointerDown,
}: {
  side: 'start' | 'end';
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <span
      onPointerDown={onPointerDown}
      className={cn(
        'absolute inset-y-0 z-10 w-2 cursor-ew-resize',
        side === 'start' ? 'left-0' : 'right-0',
      )}
    >
      <span
        className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-background/90 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </span>
  );
}

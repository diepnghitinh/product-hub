import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';

/** One day in ms — exported so adapters can derive fallback end dates (+N days). */
export const GANTT_DAY = 86_400_000;
// The left label rail is a fixed 200px. It's written as a literal in the classes
// (`grid-cols-[200px_1fr]`, `left-[200px]`) because Tailwind can't read a JS
// constant — so those three occurrences must stay in lockstep by hand.

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
      ticks.push({ x: pct(d), label: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
    }
  } else {
    const c = new Date(minMs);
    c.setDate(1);
    c.setHours(0, 0, 0, 0);
    if (c.getTime() < minMs) c.setMonth(c.getMonth() + 1);
    while (c.getTime() <= maxMs) {
      ticks.push({ x: pct(c.getTime()), label: c.toLocaleDateString(undefined, { month: 'short' }) });
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
  /** Secondary line under the label (e.g. "60% · 3 tasks"). */
  sublabel?: string;
  /** 0 = top-level, 1 = an indented child (e.g. a task under a roadmap item). */
  depth?: number;
  /** Leading dot before the label — a status/severity colour. */
  dotColor?: string;
  /** Click the label (opens a detail); mutually exclusive with `href`. */
  onClick?: () => void;
  /** Render the label as a router link instead of a button. */
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
   * would look like a snap-back. Drag is pointer-only; the row's label still
   * links to the detail, which is the keyboard/screen-reader path to the dates.
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
 * A reusable timeline (Gantt) surface: a fixed label rail on the left and a
 * date axis filling the rest, with a "today" line, weekly/monthly gridlines, and
 * one row per item — each drawn as a span **bar**, a single-date **marker**, or a
 * plain listing when it has no dates. Callers own how rows are derived and
 * coloured (see `RoadmapGanttView` and `IssueTimelineView`); this component owns
 * only the axis, the window maths, and the row chrome.
 *
 * A row that supplies `onBarChange` is also **editable**: its bar drags to a new
 * window and its edges resize, snapped to whole days.
 */
export function GanttChart({ rows, labelHeader, legend, isLoading, empty }: GanttChartProps) {
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
        <div className="min-w-[760px]">
          {/* Axis header */}
          <div className="grid grid-cols-[200px_1fr] border-b bg-muted/40">
            <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labelHeader}
            </div>
            <div className="relative h-8">
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
            <div className="pointer-events-none absolute inset-y-0 left-[200px] right-0 z-0">
              {ticks.map((tk, i) => (
                <div key={i} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${tk.x}%` }} />
              ))}
              <div className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: `${todayX}%` }} />
            </div>

            <div className="relative z-10">
              {rows.map((row) => (
                <GanttRowView key={row.id} row={row} pct={pct} spanMs={maxMs - minMs} />
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
  pct,
  spanMs,
}: {
  row: GanttRow;
  pct: (v: number) => number;
  spanMs: number;
}) {
  const child = (row.depth ?? 0) > 0;

  // The interactive label text — a link, a button, or (when neither) plain text.
  const textCls = cn(
    'min-w-0 flex-1 truncate',
    child ? 'text-xs text-muted-foreground hover:text-foreground' : 'text-sm font-medium text-foreground',
  );
  const text = row.href ? (
    <Link to={row.href} className={cn(textCls, 'hover:underline')} title={row.label}>
      {row.label}
    </Link>
  ) : row.onClick ? (
    <button type="button" onClick={row.onClick} className={cn(textCls, 'text-left hover:underline')} title={row.label}>
      {row.label}
    </button>
  ) : (
    <span className={textCls} title={row.label}>
      {row.label}
    </span>
  );
  const dot = row.dotColor ? (
    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.dotColor }} aria-hidden />
  ) : null;

  return (
    <div className="grid grid-cols-[200px_1fr] items-center border-b last:border-0 hover:bg-accent/30">
      {/* Label rail — a child indents into a single flex row; a top-level row is a
          flex column so it can carry a sublabel line under the title. */}
      <div className={cn('flex min-w-0', child ? 'items-center gap-2 py-1.5 pl-6 pr-3' : 'flex-col gap-0.5 px-3 py-2')}>
        {child ? (
          <>
            {dot}
            {text}
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              {dot}
              {text}
            </div>
            {row.sublabel && <span className="text-[11px] text-muted-foreground">{row.sublabel}</span>}
          </>
        )}
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

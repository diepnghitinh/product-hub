import { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { AlertTriangle, Lock, Plus } from 'lucide-react';
import { localeTag, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { TaskStatus, taskEstimateLabel } from '@/types/enums';
import type { CalendarTask } from './api';
import { packWeek, sameMonth, todayISO, type Segment } from './model';
import { chipDetail, type DayLoad, type TaskChip } from './workload';

/**
 * The calendar grid — one component for **both** views. A month is five-ish week
 * rows and a week is one; everything else about them (the lane packing, the
 * bars, the drop targets, the hover "+") is identical, so they share a component
 * rather than drifting apart the way two hand-rolled grids would. `dense` is the
 * only difference: month bars are shorter and capped, a week's are roomier and
 * uncapped.
 */

/** Row of weekday names, and the day-number strip inside each cell. */
const WEEKDAY_LABEL = (() => {
  const fmt = new Intl.DateTimeFormat(localeTag(), { weekday: 'short' });
  // 2024-01-07 was a Sunday — the column order the grid draws (see `startOfWeek`).
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
})();

/** Vertical space above the bars, where the day number sits. */
const HEADER_H = 26;
/** One stacked bar plus the gap beneath it. */
const LANE_H = { dense: 23, roomy: 30 };
const BAR_H = { dense: 'h-[19px]', roomy: 'h-[26px]' };

/** The soft tint idiom the boards and label chips already use. */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/**
 * Fill and border strength for a bar. A workload bar is drawn a little stronger
 * than a plain one so its column colour is legible at a glance rather than a
 * grey-looking wash — the same hue throughout, just more of it.
 */
const BAR_TINT = {
  plain: { fill: 14, border: 38, fillDone: 6, borderDone: 20 },
  workload: { fill: 22, border: 55, fillDone: 8, borderDone: 24 },
};

/**
 * The workload layer, passed only by the **assigned** calendar. Absent, the grid
 * draws exactly as it always has — which is what the personal and combined
 * calendars still want, since a personal task carries no team and no estimate to
 * put in a chip.
 */
export interface CalendarWorkload {
  /** Per-day load for the visible period, keyed by ISO day. */
  byDay: Map<string, DayLoad>;
  /** The busiest day in view; load bars are drawn relative to it. */
  peak: number;
  chipOf: (task: CalendarTask) => TaskChip;
}

export interface CalendarGridProps {
  /** The rows to draw, each a run of 7 ISO days (Sunday first). */
  weeks: string[][];
  /** Month view: days outside this month are dimmed. Omit in week view. */
  month?: string;
  tasks: CalendarTask[];
  /** Bars drawn per week before the rest collapse into "+N". Omit for no cap. */
  maxLanes?: number;
  /** A task's status colour, from its own board's column config. */
  colorOf: (task: CalendarTask) => string;
  onOpen: (task: CalendarTask) => void;
  /** The hover "+" on a day, and a click on its empty space. */
  onAdd: (day: string) => void;
  /** "+N more", and the day number — opens that day on its own. */
  onPeek: (day: string) => void;
  /** The bar being dragged right now, hidden in place while the overlay carries it. */
  draggingId?: string | null;
  /** Per-day load and per-bar chips. Omit for the plain calendar. */
  workload?: CalendarWorkload;
}

export function CalendarGrid({
  weeks,
  month,
  tasks,
  maxLanes,
  colorOf,
  onOpen,
  onAdd,
  onPeek,
  draggingId,
  workload,
}: CalendarGridProps) {
  const dense = !!maxLanes;
  // Week view is one row, so its column headers can carry that day's load. A
  // month's single header row sits above five different weeks, where a per-day
  // number would be ambiguous — there the load rides in the cells instead.
  const headerDays = !dense && weeks.length === 1 ? weeks[0] : null;

  return (
    // Below `sm` the seven columns can't be legible *and* fit, so the grid keeps
    // its shape and scrolls sideways — a squeezed calendar reads as broken, a
    // scrollable one reads as a calendar.
    //
    // *One* scroller, for both axes, with the weekday header sticky inside it.
    // The header used to sit outside a separately-scrolling body, which meant
    // the body lost ~15px to its scrollbar and the header didn't: seven columns
    // divided over two different widths, drifting further apart the further
    // right you looked. Sharing the scroller makes the two widths the same
    // number by construction, so they can't disagree.
    <div className="min-h-0 flex-1 overflow-auto">
      {/* `min-h-full`, not `h-full`: at least a screen tall, so a light month's
          rows still share out the leftover room, but free to grow past it and
          let the scroller above do its job. */}
      <div className="flex min-h-full min-w-[720px] flex-col sm:min-w-0">
        <div className="sticky top-0 z-10 grid shrink-0 grid-cols-7 border-y bg-background">
          {WEEKDAY_LABEL.map((label, i) => {
            const load = headerDays && workload?.byDay.get(headerDays[i]);
            return (
              <div
                key={label}
                className={cn(
                  'flex items-center justify-center gap-1.5 px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground',
                  i < 6 && 'border-r',
                )}
              >
                {label}
                {!!load?.points && (
                  <span
                    className="rounded bg-muted px-1 text-[10px] normal-case tabular-nums text-foreground"
                    title={t('calendar.loadTooltip')
                      .replace('{n}', String(Math.round(load.points)))
                      .replace('{c}', String(load.count))}
                  >
                    {t('calendar.pointsShort').replace('{n}', String(Math.round(load.points)))}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* No `min-h-0` and no scroller of its own: the rows push this box to
            their own height and the wrapper above grows with it, so what
            overflows is the *shared* scroller — the one the header is stuck to.
            `flex-1` still shares out any room left over on a light month. */}
        <div className="flex flex-1 flex-col">
          {weeks.map((days) => (
            <WeekRow
              key={days[0]}
              days={days}
              month={month}
              tasks={tasks}
              dense={dense}
              maxLanes={maxLanes}
              colorOf={colorOf}
              onOpen={onOpen}
              onAdd={onAdd}
              onPeek={onPeek}
              draggingId={draggingId}
              workload={workload}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekRow({
  days,
  month,
  tasks,
  dense,
  maxLanes,
  colorOf,
  onOpen,
  onAdd,
  onPeek,
  draggingId,
  workload,
}: {
  days: string[];
  dense: boolean;
} & Omit<CalendarGridProps, 'weeks'>) {
  const segments = useMemo(() => packWeek(tasks, days), [tasks, days]);
  const visible = maxLanes ? segments.filter((s) => s.lane < maxLanes) : segments;

  // Per-column count of what the cap pushed out of view, so a day can offer the
  // "+N more" that opens it in full. A capped grid that simply dropped the rest
  // would be lying about how much is on that day.
  const hidden = useMemo(() => {
    const counts = new Map<number, number>();
    if (!maxLanes) return counts;
    for (const s of segments) {
      if (s.lane < maxLanes) continue;
      for (let c = s.from; c <= s.to; c++) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [segments, maxLanes]);

  const laneH = dense ? LANE_H.dense : LANE_H.roomy;
  const lanesUsed = maxLanes ?? segments.reduce((max, s) => Math.max(max, s.lane), -1) + 1;
  // Tall enough for the bars it actually holds; `flex-1` then shares out any
  // room left over, so a light month fills the page instead of hugging the top.
  // The month's load strip is footer chrome, so the row has to reserve for it.
  const loadStrip = !!workload && dense;
  const minHeight = HEADER_H + lanesUsed * laneH + (dense ? 20 : 12) + 8 + (loadStrip ? 14 : 0);

  return (
    <div
      className="relative grid flex-1 grid-cols-7 border-b last:border-b-0"
      style={{ minHeight }}
    >
      {days.map((day, col) => (
        <DayCell
          key={day}
          day={day}
          col={col}
          outside={!!month && !sameMonth(day, month)}
          hiddenCount={hidden.get(col) ?? 0}
          onAdd={onAdd}
          onPeek={onPeek}
          load={loadStrip ? (workload!.byDay.get(day) ?? null) : null}
          peak={workload?.peak ?? 0}
        />
      ))}

      {/* Bars ride above the cells so one can span several of them. The layer is
          click-through; each bar turns pointer events back on for itself, which
          is what leaves a day's empty space clickable for "add". */}
      <div className="pointer-events-none absolute inset-0">
        {visible.map((s) => (
          <TaskBar
            key={s.task.id}
            segment={s}
            laneH={laneH}
            dense={dense}
            color={colorOf(s.task)}
            dragging={draggingId === s.task.id}
            onOpen={onOpen}
            chip={workload?.chipOf(s.task)}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day,
  col,
  outside,
  hiddenCount,
  onAdd,
  onPeek,
  load,
  peak,
}: {
  day: string;
  col: number;
  outside: boolean;
  hiddenCount: number;
  onAdd: (day: string) => void;
  onPeek: (day: string) => void;
  /** This day's load, or `null` on a plain calendar / in week view. */
  load: DayLoad | null;
  peak: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const isToday = day === todayISO();

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/day relative flex flex-col transition-colors',
        col < 6 && 'border-r',
        outside && 'bg-muted/30',
        isOver && 'bg-primary/10',
      )}
    >
      {/* The whole cell is the "add here" target, sitting *behind* the bars. It
          is a button so the keyboard reaches it too. */}
      <button
        type="button"
        onClick={() => onAdd(day)}
        aria-label={t('calendar.addOn').replace('{date}', day)}
        className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      <div className="pointer-events-none relative flex items-center justify-between px-1.5 pt-1">
        <button
          type="button"
          onClick={() => onPeek(day)}
          className={cn(
            'pointer-events-auto grid size-[18px] place-items-center rounded-full text-[11px] tabular-nums transition-colors hover:bg-accent hover:text-accent-foreground',
            isToday && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
            !isToday && (outside ? 'text-muted-foreground/60' : 'text-muted-foreground'),
          )}
        >
          {Number(day.slice(8, 10))}
        </button>
        <button
          type="button"
          onClick={() => onAdd(day)}
          title={t('calendar.addOn').replace('{date}', day)}
          aria-hidden
          tabIndex={-1}
          // Hover-only chrome: needs an opaque fill of its own, or the bars
          // beneath it show through the glyph.
          className="pointer-events-auto grid size-[18px] place-items-center rounded bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/day:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Footer chrome, bottom-aligned as one block so the overflow link and the
          load strip can't fight over `mt-auto`. */}
      <div className="relative mt-auto">
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => onPeek(day)}
            className="pointer-events-auto block w-full truncate px-1.5 pb-1 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('calendar.more').replace('{n}', String(hiddenCount))}
          </button>
        )}
        {/* A day with nothing on it gets no strip — an empty track is chrome
            pointing at nothing, and a month is mostly empty days. */}
        {!!load?.count && <LoadStrip load={load} peak={peak} />}
      </div>
    </div>
  );
}

/**
 * How heavy a day is, as a bar plus its points.
 *
 * The bar is scaled to the **busiest day in view**, not to a capacity target:
 * nothing in the product says how much one person can take in a day, and a
 * progress bar implying a limit that doesn't exist would be an invented fact.
 * Read relatively it still answers the question worth asking — *which days are
 * the heavy ones?*
 *
 * Overdue is shown as its own mark rather than by recolouring the load bar. They
 * are different facts, and a day can easily be light and late at once.
 */
function LoadStrip({ load, peak }: { load: DayLoad; peak: number }) {
  const points = Math.round(load.points);
  const pct = peak > 0 ? Math.max(6, (load.points / peak) * 100) : 0;
  const label = t('calendar.loadTooltip')
    .replace('{n}', String(points))
    .replace('{c}', String(load.count));

  return (
    <div className="pointer-events-none flex items-center gap-1 px-1.5 pb-1" title={label}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        {/* Neutral, not `primary`: this bar is an annotation on the day, and the
            task bars above it are the content. Brand purple here out-shouts the
            status tints it sits under, and colour on this grid means status. */}
        {load.points > 0 && (
          <div className="h-full rounded-full bg-foreground/30" style={{ width: `${pct}%` }} />
        )}
      </div>
      {load.overdue > 0 && (
        <AlertTriangle className="size-2.5 shrink-0 text-destructive" aria-hidden />
      )}
      {/* The number is decoration beside the sr-only sentence below, which says
          the same thing in full — announcing both would read it twice. */}
      <span
        aria-hidden
        className={cn(
          'text-[10px] leading-none tabular-nums',
          load.overdue > 0 ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        {points > 0 ? points : ''}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * One task's bar. Draggable to reschedule; a plain click opens it — dnd-kit's
 * 8px activation distance is what keeps those two apart, the same threshold the
 * kanban cards use.
 *
 * A bar that runs past the week's edge is squared off on that side, so a
 * fortnight of work reads as one continuous run across two rows rather than as
 * two unrelated tasks that happen to share a title.
 */
function TaskBar({
  segment,
  laneH,
  dense,
  color,
  dragging,
  onOpen,
  chip,
}: {
  segment: Segment<CalendarTask>;
  laneH: number;
  dense: boolean;
  color: string;
  dragging: boolean;
  onOpen: (task: CalendarTask) => void;
  /** Team key, points and lateness — the assigned calendar only. */
  chip?: TaskChip;
}) {
  const { task, from, to, lane, clippedStart, clippedEnd } = segment;
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id, data: { task } });
  const done = task.status === TaskStatus.DONE;
  const late = !!chip?.overdue;
  // What fits beside the title at this width — the title always wins.
  const detail = chip ? chipDetail(to - from + 1, dense) : 'none';
  const strength = chip ? BAR_TINT.workload : BAR_TINT.plain;

  return (
    <div
      className="pointer-events-none absolute px-[3px]"
      style={{
        left: `${(from / 7) * 100}%`,
        width: `${((to - from + 1) / 7) * 100}%`,
        top: HEADER_H + lane * laneH,
      }}
    >
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        onClick={() => onOpen(task)}
        // Whatever the chips had to drop for width still reaches you on hover —
        // a one-day bar in a month cell shows a title and nothing else.
        title={
          chip
            ? [
                task.title,
                chip.teamName,
                chip.points ? taskEstimateLabel(chip.points) : '',
                late ? t('calendar.overdue') : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : task.title
        }
        style={{
          backgroundColor: tint(color, done ? strength.fillDone : strength.fill),
          // Late work takes the app's overdue tone on its edge; everything else
          // keeps its own column colour.
          borderColor: late
            ? // The ink token, not the surface one — this edge is a mark that has
              // to stay legible, and the surface red all but vanishes on dark.
              'hsl(var(--destructive-text))'
            : tint(color, done ? strength.borderDone : strength.border),
          // Hidden rather than unmounted: the row's lanes must not re-pack
          // mid-drag, or every other bar would shuffle under the cursor.
          visibility: dragging ? 'hidden' : undefined,
        }}
        className={cn(
          'pointer-events-auto flex w-full cursor-grab items-center gap-1 overflow-hidden rounded-md border px-1.5 text-left outline-none transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
          dense ? BAR_H.dense : BAR_H.roomy,
          clippedStart && 'rounded-l-none border-l-0',
          clippedEnd && 'rounded-r-none border-r-0',
        )}
      >
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        {task.source === 'personal' && (
          <Lock
            className="size-2.5 shrink-0 text-muted-foreground"
            aria-label={t('calendar.private')}
          />
        )}
        {/* Overdue carries an icon as well as the tone — colour is never the only
            thing saying a task is late. */}
        {late && (
          <AlertTriangle
            className="size-2.5 shrink-0 text-destructive"
            aria-label={t('calendar.overdue')}
          />
        )}
        {/* No `flex-1` when there are chips: the title has to give its leftover
            room to them, or a five-day bar strands its team and points against
            the far edge where they read as belonging to the last day. */}
        <span
          className={cn(
            'min-w-0 truncate text-[11px] leading-none',
            detail === 'none' && 'flex-1',
            !dense && 'text-xs',
            late ? 'font-medium text-destructive' : 'text-foreground',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </span>
        {chip && detail !== 'none' && (
          <span className="flex shrink-0 items-center gap-1 leading-none">
            {detail === 'full' && chip.teamKey && (
              // A team key is a free-text slug — `qc` but also `engineering`, so
              // it's capped rather than trusted to be short. The full name is on
              // the bar's tooltip either way.
              <span className="max-w-[60px] truncate rounded bg-foreground/[0.07] px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {chip.teamKey}
              </span>
            )}
            {chip.points > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">{chip.points}</span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}

/** The bar under the cursor mid-drag — the same chip, lifted. */
export function CalendarDragBar({ task, color }: { task: CalendarTask; color: string }) {
  return (
    <div
      className="flex h-[22px] w-[180px] items-center gap-1 rounded-md border px-1.5 shadow-lg"
      style={{ backgroundColor: tint(color, 22), borderColor: tint(color, 50) }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-[11px] leading-none text-foreground">
        {task.title}
      </span>
    </div>
  );
}

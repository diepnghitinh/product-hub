import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localeTag, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Spinner } from '@/components/ui/Spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatar } from '@/components/UserAvatar';

/**
 * A reusable **calendar** surface — the sibling of `<GanttChart>`.
 *
 * A timeline answers "how do these run against each other?"; a calendar answers
 * "what is happening on the 14th?". Same data, different question, and the
 * second one is the one a weekly plan is read with — which is why the boards
 * grew a Calendar tab beside Timeline rather than one replacing the other.
 *
 * **One zoom ladder, one reading.** Year · Month · Week · Day are how much of
 * the calendar is on screen, not four different calendars: the same events,
 * colours, lanes and click targets, windowed differently. What changes between
 * them is the **unit of a column**.
 *   • **Year** — twelve columns, one per month. The zoom-*out*, and the answer
 *     to a bar that ran off the edge of a month: a run that filled all of
 *     September is a short block here, and one that takes a quarter visibly
 *     takes three columns. "How many months is this?" is read off the bar.
 *   • **Month** — the planning read. Columns are days; a run that spans the
 *     month is one bar across five week rows.
 *   • **Week** — the same grid, one row, with room under it: the week's runs
 *     stack in full instead of being squeezed into a 6rem cell.
 *   • **Day** — a *list* of everything live that day, not a grid. An item that
 *     runs all month is one row here, beside the other work of that day, with
 *     its chips and its people spelled out. There's no hour axis because the
 *     data has no hours — an item is scheduled to days, and drawing 9am would be
 *     an invention.
 *
 * Callers own how events are derived and coloured (see `IssueCalendarView`);
 * this component owns the grid, the cell/lane maths, the navigation, and the
 * agenda. Like the Gantt, it never fetches and never knows what an issue is.
 *
 * **Responsive:** a multi-column grid is unreadable under about 640px, so below
 * `md` every gridded range falls back to the same **cell-by-cell agenda** the
 * Day range uses — the same events, the same colours, in the shape a phone can
 * hold (a year lists twelve month cards, a month lists its days).
 */

/** How much of the calendar is on screen. `month` is the default everywhere, and
 *  the only range a caller that doesn't offer the switch can be in. */
export type CalendarRange = 'year' | 'month' | 'week' | 'day';

/** Someone on an event — enough to draw a face and name them on hover. */
export interface CalendarPerson {
  id: string;
  name: string;
}

/** One thing on the calendar. Dates are ISO days (`YYYY-MM-DD`); a one-ended
 *  event occupies the single day it has. */
export interface CalendarEvent {
  id: string;
  label: string;
  /** The event's own colour — a team status, a severity, an item's own tint.
   *  Falls back to muted. */
  color?: string;
  /**
   * 0–100. When set, the bar carries a **small progress bar** after its label: a
   * track of `color` filled to this %.
   *
   * It used to be poured across the whole bar instead, as a deeper tint filling
   * left to right. That read as a *second colour* on a strip already coloured by
   * status — on a month of overlapping runs you were guessing whether a bar was
   * half-full or simply two-tone. A mini bar is the shape people already read a
   * percentage in (it's the one on the item's own page), so it needs no legend.
   * Omitted (the issue boards) → no bar, because a scheduled issue has no
   * percentage.
   */
  progress?: number;
  /** Who's on it. Drawn as a stack of up to {@link MAX_FACES} faces at the end of
   *  the bar, named in full on hover — "who is this week's work on?" answered
   *  without opening anything. The small-screen agenda names people through
   *  `meta` instead, where a row has width for a badge with a name in it. */
  assignees?: CalendarPerson[];
  /** ISO day. Omitted → the event sits on `end` alone. */
  start?: string;
  /** ISO day, inclusive. Omitted → the event sits on `start` alone. */
  end?: string;
  /** Extra context on hover — the caller composes it (title · dates · status). */
  tooltip?: string;
  onClick?: () => void;
  /** Rendered after the label inside the agenda row (chips, assignees). */
  meta?: ReactNode;
}

export interface CalendarViewProps {
  /** The day the window is drawn around: any day of the year, of the month, of
   *  the week, or the day itself. */
  anchor: Date;
  onAnchorChange: (next: Date) => void;
  /** How much is on screen. Defaults to `month`. */
  range?: CalendarRange;
  /** Omit to show no range switch — a caller that doesn't hold the range (the
   *  public share, which has no URL state of its own) stays on the month. */
  onRangeChange?: (next: CalendarRange) => void;
  events: CalendarEvent[];
  isLoading?: boolean;
  /** Shown when the window holds nothing. The title is replaced by this
   *  component's own wording on a week or a day — a caller writes its empty note
   *  for the month it knows about, and "nothing this month" under a Tuesday is
   *  simply wrong. */
  empty?: { title: string; hint?: string };
  /** Anything the caller wants beside the date controls (a legend, a count). */
  toolbar?: ReactNode;
}

const DAY_MS = 86_400_000;

/** ISO day → epoch ms at UTC midnight, or NaN. Parsed by hand rather than via
 *  `Date` so a bare `YYYY-MM-DD` can never be shifted by the viewer's timezone —
 *  the calendar's whole job is putting a day in the right box. */
function dayMs(iso?: string | null): number {
  if (!iso) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Epoch ms (UTC midnight) → ISO day. */
const msDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Today as a UTC-midnight stamp, read off the viewer's local date — "today" is
 *  the day they're living in, not the one UTC is on. */
function todayMs(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A local `Date` → the UTC-midnight stamp of the day it names. The pair to
 *  `dayMs`, for the anchor, which comes from the caller as a real date. */
const stampOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

/** The six-week window a month is drawn in: whole weeks, Monday-first, covering
 *  every day of the month plus the neighbours that share its first/last week. */
function monthGrid(month: Date): number[] {
  const first = Date.UTC(month.getFullYear(), month.getMonth(), 1);
  // getUTCDay is 0=Sunday; shift so Monday is 0.
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - lead * DAY_MS;
  const last = Date.UTC(month.getFullYear(), month.getMonth() + 1, 0);
  const trail = 6 - ((new Date(last).getUTCDay() + 6) % 7);
  const end = last + trail * DAY_MS;
  const days: number[] = [];
  for (let d = start; d <= end; d += DAY_MS) days.push(d);
  return days;
}

/** Monday → Sunday of the week holding `day`. Same Monday-first rule as the
 *  month grid, so a week looks like a row lifted straight out of it. */
function weekGrid(day: Date): number[] {
  const stamp = stampOf(day);
  const monday = stamp - ((new Date(stamp).getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => monday + i * DAY_MS);
}

/**
 * One column of the grid: a **day** in the month, week and day ranges, a whole
 * **month** in the year range.
 *
 * The cell, not the day, is what the grid is built from — that one change is
 * what lets the year range exist without a second calendar. A bar doesn't know
 * whether it spans four days or four months; it spans four *cells*.
 */
export interface CalendarCell {
  /** UTC-midnight stamp of the cell's first day. */
  from: number;
  /** …and of its last, inclusive. A day cell has `from === to`. */
  to: number;
}

const dayCell = (stamp: number): CalendarCell => ({ from: stamp, to: stamp });

/** The twelve months of `year`, each from its 1st to its last day. */
function yearCells(year: number): CalendarCell[] {
  return Array.from({ length: 12 }, (_, m) => ({
    from: Date.UTC(year, m, 1),
    // Day 0 of the next month is the last day of this one — leap years included.
    to: Date.UTC(year, m + 1, 0),
  }));
}

/**
 * The cells on screen for a range: twelve months for `year`, whole Monday-first
 * weeks of days for `month` and `week`, one day for `day`.
 *
 * Exported for its own test — everything downstream (which bars are packed,
 * which agenda cards exist, what the header says) is derived from this list, so
 * an off-by-one here is an off-by-one everywhere.
 */
export function periodCells(range: CalendarRange, anchor: Date): CalendarCell[] {
  if (range === 'year') return yearCells(anchor.getFullYear());
  if (range === 'day') return [dayCell(stampOf(anchor))];
  if (range === 'week') return weekGrid(anchor).map(dayCell);
  return monthGrid(anchor).map(dayCell);
}

/** How many columns a row of this range has — a week of days, or a year of
 *  months. The `day` range is a list and has no grid. */
export function columnsOf(range: CalendarRange): number {
  return range === 'year' ? 12 : 7;
}

/**
 * Paging: one year, month, week or day at a time, in the unit that's on screen.
 * Exported beside {@link periodCells} and tested with it — an arrow that skips a
 * week, or lands on the 31st of a 30-day month, is the classic calendar bug.
 */
export function shiftPeriod(range: CalendarRange, anchor: Date, by: number): Date {
  if (range === 'year') return new Date(anchor.getFullYear() + by, 0, 1);
  if (range === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + by, 1);
  const step = range === 'week' ? 7 : 1;
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + by * step);
}

/** One event's run inside one row: which column it starts in, how many it spans. */
interface Segment {
  event: CalendarEvent;
  col: number;
  span: number;
  /** The event continues before/after this row — drawn with a flat edge, so a
   *  bar that runs across a week boundary doesn't read as two separate things. */
  clipStart: boolean;
  clipEnd: boolean;
  lane: number;
}

/** An event's run as a pair of UTC stamps, or `null` if it has no usable date.
 *  A one-ended event is a single day on the end it has. */
function runOf(event: CalendarEvent): { lo: number; hi: number } | null {
  const s = dayMs(event.start);
  const e = dayMs(event.end);
  const from = Number.isNaN(s) ? e : s;
  const to = Number.isNaN(e) ? s : e;
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return { lo: Math.min(from, to), hi: Math.max(from, to) };
}

/**
 * Events packed into lanes across one row of cells, greedily: the first lane
 * with room takes the segment, which is what keeps a week three rows tall
 * instead of one row per event.
 *
 * Columns are found by **overlap**, not by subtracting stamps, because a year's
 * cells are months of unequal length — "how many cells does 14 Sep → 3 Nov
 * cover?" has no arithmetic answer, only a search.
 */
export function packRow(cells: CalendarCell[], events: CalendarEvent[]): Segment[] {
  const rowStart = cells[0].from;
  const rowEnd = cells[cells.length - 1].to;
  const segments: Omit<Segment, 'lane'>[] = [];
  for (const event of events) {
    const run = runOf(event);
    if (!run) continue;
    const { lo, hi } = run;
    if (hi < rowStart || lo > rowEnd) continue;
    const col = cells.findIndex((c) => c.to >= lo);
    let last = col;
    while (last + 1 < cells.length && cells[last + 1].from <= hi) last += 1;
    segments.push({
      event,
      col,
      span: last - col + 1,
      clipStart: lo < rowStart,
      clipEnd: hi > rowEnd,
    });
  }
  // Longest first, then earliest — a month-long bar should get lane 0 rather
  // than being pushed under the one-day items it contains.
  segments.sort((a, b) => b.span - a.span || a.col - b.col);
  const lanes: number[][] = [];
  return segments.map((seg) => {
    let lane = lanes.findIndex((occupied) => occupied.every((c) => c < seg.col || c >= seg.col + seg.span));
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    for (let c = seg.col; c < seg.col + seg.span; c += 1) lanes[lane].push(c);
    return { ...seg, lane };
  });
}

/** Height of one event bar plus its gap, in px — the grid needs it as a number
 *  to size a week row from its lane count. */
const LANE_H = 22;

/** How much of `color` a bar is poured with, at rest and while hovered. One
 *  table rather than literals scattered through the markup: the label has to
 *  stay readable on top of either pour, and the pair has to stay far enough
 *  apart that hovering is visible at all — a relationship, not two numbers.
 *  (The progress meter is deliberately *not* here; it wears the app's own
 *  progress colours — see `ProgressBar`.) */
const TINT = { bar: { rest: 14, hover: 26 } } as const;

/** `color` poured at `pct` opacity over whatever is behind it. */
const pour = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** How many faces fit before the rest collapse into a `+N` — the same cap the
 *  board cards use (`AssigneeBadge`), so a shared item looks the same either place. */
export const MAX_FACES = 3;

/**
 * What the trailing cluster costs, in px: the room a bar must have left after
 * its label before each part earns its place.
 *
 * Priced rather than inferred from the day count, because the same three-day bar
 * is 570px wide on a desktop and 200px in a narrow pane. `label` is the floor: a
 * title clipped to "Vi…" tells a reader nothing, so the percentage and the faces
 * only appear on bars that can still say what they are about.
 */
const COST = { label: 56, progress: 44, face: 19, faceStacked: 10 } as const;

/** The left/right inset a bar is drawn with inside its day columns. */
const BAR_INSET = 8;

/**
 * What fits on a bar this wide, in order of what a reader loses least by losing:
 * the label always, then the percentage, then as many faces as there is room for.
 *
 * Exported for its own test. Nothing here wraps — a bar is one line tall by
 * design — so the failure this guards against is the silent one: a cluster that
 * eats the title instead of standing down.
 */
export function barSlots(
  width: number,
  { progress, people }: { progress: boolean; people: number },
): { progress: boolean; faces: number; extra: number } {
  let room = width - COST.label;

  // Faces are priced before the percentage, and the order is load-bearing: they
  // outrank it (a percentage is one click away, "is this mine?" is the question
  // the month is scanned with), and pricing the percentage first made the budget
  // non-monotonic — a bar wide enough for the meter but not for meter + face
  // showed FEWER faces than a narrower one, so widening a pane made a face
  // disappear.
  let faces = 0;
  while (faces < Math.min(people, MAX_FACES)) {
    const cost = faces === 0 ? COST.face : COST.faceStacked;
    if (room < cost) break;
    room -= cost;
    faces += 1;
  }

  // `+N` rides in one more stacked slot, priced with the faces it belongs to for
  // the same reason: bought after the percentage it would appear on one bar and
  // vanish from a wider one. With no face to stack on (or no room for it) the
  // count is dropped rather than shown alone — hovering names everyone anyway.
  const hidden = people - faces;
  const extra = faces > 0 && hidden > 0 && room >= COST.faceStacked ? hidden : 0;
  if (extra) room -= COST.faceStacked;

  return { progress: progress && room >= COST.progress, faces, extra };
}

/**
 * The percentage on a calendar bar: a small **ring plus the number**.
 *
 * A bar was the wrong instrument at this size. 24px of track carrying a
 * percentage reads as a dash — you can see *that* something is part-done and not
 * how far, which is the only thing the number was there to say. So the number
 * says it, and the ring is what makes it findable while scanning a month.
 *
 * Colours stay the app's progress colours (`secondary` track, `primary` arc, the
 * number in `muted-foreground` exactly as on the item's own page) rather than
 * the item's tint — a percentage that changes colour per row reads as a
 * category, not a quantity. The full bar still draws on the agenda below `md`,
 * where a row is wide enough for one to mean something.
 */
function MiniProgress({ pct }: { pct: number }) {
  // r=5 with a 2-wide stroke lands the outer edge exactly on the 12px box.
  const r = 5;
  const circumference = 2 * Math.PI * r;
  return (
    <span
      className="relative flex shrink-0 items-center gap-0.5"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* -rotate-90 starts the arc at twelve o'clock rather than three. */}
      <svg viewBox="0 0 12 12" className="size-3 shrink-0 -rotate-90" aria-hidden>
        <circle cx="6" cy="6" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="2" />
        <circle
          cx="6"
          cy="6"
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{pct}%</span>
    </span>
  );
}

/**
 * Who's on the event: overlapping faces, **each with its own name on hover**.
 *
 * One tooltip over the whole stack would answer the wrong question — you point
 * at a face to ask "who is *that*?", and being handed all three names back
 * leaves you to guess which is which. So every disc is its own trigger; only the
 * `+N` speaks for a group, because that is what it stands for.
 *
 * `title=""` on each trigger is deliberate: it blanks the bar's own native
 * tooltip for the moment the pointer is over a face, so the name isn't shown
 * under a second, browser-drawn box repeating the item's dates.
 */
function FaceStack({
  people,
  faces,
  extra,
}: {
  people: CalendarPerson[];
  faces: number;
  extra: number;
}) {
  const hidden = people.slice(faces);
  return (
    <span className="relative flex shrink-0 items-center">
      {people.slice(0, faces).map((person, i) => (
        <Tooltip key={person.id}>
          <TooltipTrigger asChild>
            <span
              title=""
              // Overlapping by 6 of 15px — the faces read as a stack, and the
              // ring (the page's own ground) keeps them separate discs rather
              // than one blob. `AssigneeBadge`'s trick, thinner because this
              // sits inside an 18px bar.
              className={cn('relative shrink-0', i > 0 && '-ml-1.5')}
              style={{ zIndex: faces - i }}
            >
              <UserAvatar
                tint
                seed={person.id}
                name={person.name}
                className="size-[15px] ring-1 ring-background"
                fallbackClassName="text-[7px]"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{person.name}</TooltipContent>
        </Tooltip>
      ))}
      {extra > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              title=""
              className="-ml-1.5 grid size-[15px] shrink-0 place-items-center rounded-full bg-muted text-[7px] font-semibold tabular-nums text-muted-foreground ring-1 ring-background"
            >
              +{extra}
            </span>
          </TooltipTrigger>
          {/* The one place a list belongs: this disc *is* the group. */}
          <TooltipContent className="max-w-xs">
            {hidden.map((person) => (
              <div key={person.id} className="whitespace-nowrap">
                {person.name}
              </div>
            ))}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

/**
 * The width of one column, in px — measured from the **grid**, not the
 * viewport, so a bar re-prices its cluster when the sidebar collapses or a
 * drawer opens, not only when the window resizes. Read in a layout effect
 * (before paint, so there's no flash of a label-only bar) and then on every
 * resize. It is 0 until measured and 0 while the grid is `display:none` below
 * `md` — both meaning "only the label fits", which is the right answer for a
 * grid nobody is looking at.
 */
function useColumnWidth(ref: RefObject<HTMLElement>, cols: number): number {
  const [col, setCol] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number) => setCol(width / cols);
    measure(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, cols]);
  return col;
}

/** The cells of `range` that are "in" it — the month's own days (its grid also
 *  carries the neighbours that share its first and last week); everything else
 *  is wholly inside the window it was built for. */
function inRange(range: CalendarRange, cell: CalendarCell, monthIndex: number): boolean {
  return range !== 'month' || new Date(cell.from).getUTCMonth() === monthIndex;
}

/** Every event live during `cell` — a single day, or any part of a month, in the
 *  order the caller gave them. */
function eventsIn(cell: CalendarCell, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => {
    const run = runOf(e);
    return !!run && run.hi >= cell.from && run.lo <= cell.to;
  });
}

/**
 * How long a run lasts, for a row that isn't a bar — `null` for anything that
 * starts and ends on the day it's listed under.
 *
 * The month grid says this with the bar's *length*; a list has no length to
 * read, so the Day range would otherwise show a month-long item and a one-day
 * item as two identical rows. This is the piece of the bar worth keeping.
 */
function runLabel(event: CalendarEvent, locale: string): string | null {
  const s = dayMs(event.start);
  const e = dayMs(event.end);
  const from = Number.isNaN(s) ? e : s;
  const to = Number.isNaN(e) ? s : e;
  if (Number.isNaN(from) || Number.isNaN(to) || from === to) return null;
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(Math.min(from, to))} – ${fmt(Math.max(from, to))}`;
}

/**
 * **Year · Month · Week · Day** — how much of the calendar is on screen, widest
 * first, so the strip reads as one zoom slider rather than four buttons.
 *
 * Same tokens and the same shape as the boards' other segmented switches (a
 * bordered group, the active side lifted with `secondary`), so it introduces no
 * colour of its own and reads as a sibling of the Gantt/Calendar toggle it
 * usually sits beside.
 */
function RangeSwitch({
  value,
  onChange,
}: {
  value: CalendarRange;
  onChange: (next: CalendarRange) => void;
}) {
  const ranges: CalendarRange[] = ['year', 'month', 'week', 'day'];
  const label: Record<CalendarRange, string> = {
    year: t('calendar.rangeYear'),
    month: t('calendar.rangeMonth'),
    week: t('calendar.rangeWeek'),
    day: t('calendar.rangeDay'),
  };
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-card p-0.5"
      role="group"
      aria-label={t('calendar.range')}
    >
      {ranges.map((key) => (
        <Button
          key={key}
          type="button"
          variant={value === key ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 px-2 text-xs"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {label[key]}
        </Button>
      ))}
    </div>
  );
}

export function CalendarView({
  anchor,
  onAnchorChange,
  range = 'month',
  onRangeChange,
  events,
  isLoading,
  empty,
  toolbar,
}: CalendarViewProps) {
  // Which event the pointer is on, by id — **not** which bar. A run that crosses
  // a week boundary is drawn as one button per week, and a month-long item shows
  // up on four separate rows; highlighting only the segment under the cursor
  // would hide the very thing hovering is for, which is seeing how far the item
  // actually runs. Held here, so every segment of one event lights up together.
  const [hovered, setHovered] = useState<string | null>(null);
  const cols = columnsOf(range);
  // What a bar can afford to show is a question about pixels, not cells — see
  // `useColumnWidth`.
  const gridRef = useRef<HTMLDivElement>(null);
  const colWidth = useColumnWidth(gridRef, cols);

  const cells = useMemo(() => periodCells(range, anchor), [range, anchor]);
  // The Day range is a list, not a grid — nothing to pack. Every other range is
  // one or more rows of `cols` cells: five weeks of days, one week, one year of
  // months.
  const rows = useMemo(() => {
    if (range === 'day') return [];
    const out: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += cols) out.push(cells.slice(i, i + cols));
    return out;
  }, [cells, cols, range]);
  const packed = useMemo(() => rows.map((row) => packRow(row, events)), [rows, events]);

  const today = todayMs();
  const monthIndex = anchor.getMonth();
  const locale = localeTag();
  /** The grid's column headings — weekday names, or `null` for a year, whose
   *  columns are named by the cells themselves (see the grid). */
  const headings = useMemo(() => {
    if (range === 'year') return null;
    // A known Monday, so the names come out Monday-first in whatever locale.
    const monday = Date.UTC(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) =>
      new Date(monday + i * DAY_MS).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }),
    );
  }, [locale, range]);

  const shift = (by: number) => onAnchorChange(shiftPeriod(range, anchor, by));

  /** The agenda's cards — every cell **in range** that holds something. It is the
   *  small-screen reading of every gridded range, and the Day range itself. */
  const agenda = useMemo(() => {
    const out: [CalendarCell, CalendarEvent[]][] = [];
    for (const cell of cells) {
      if (!inRange(range, cell, monthIndex)) continue;
      const on = eventsIn(cell, events);
      if (on.length) out.push([cell, on]);
    }
    return out;
  }, [cells, events, monthIndex, range]);

  /** What the header says we're looking at, and what the arrows step through. */
  const title =
    range === 'year'
      ? String(anchor.getFullYear())
      : range === 'month'
        ? anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
        : range === 'day'
          ? new Date(cells[0].from).toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })
          : `${new Date(cells[0].from).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            })} – ${new Date(cells[6].from).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })}`;
  const prevLabel = {
    year: t('calendar.prevYear'),
    month: t('calendar.prevMonth'),
    week: t('calendar.prevWeek'),
    day: t('calendar.prevDay'),
  }[range];
  const nextLabel = {
    year: t('calendar.nextYear'),
    month: t('calendar.nextMonth'),
    week: t('calendar.nextWeek'),
    day: t('calendar.nextDay'),
  }[range];
  // A caller writes its empty note for a month ("Nothing scheduled this month"),
  // which is simply wrong under a Tuesday. Its *hint* still holds — it says how
  // something gets on the calendar at all.
  const emptyTitle =
    range === 'month'
      ? empty?.title
      : t(
          range === 'year'
            ? 'calendar.emptyYear'
            : range === 'week'
              ? 'calendar.emptyWeek'
              : 'calendar.emptyDay',
        );

  const header = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label={prevLabel}>
          <ChevronLeft className="size-4" />
        </Button>
        {/* One width for all three ranges, so stepping through days doesn't walk
            the arrows left and right under the pointer. */}
        <span className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">
          {title}
        </span>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label={nextLabel}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={() => onAnchorChange(new Date())}>
        {t('calendar.today')}
      </Button>
      {onRangeChange && <RangeSwitch value={range} onChange={onRangeChange} />}
      {toolbar && <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>}
    </div>
  );

  if (isLoading) {
    return (
      <>
        {header}
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      {/* ── Grid: year, month or week (md and up) ──────────────────────────── */}
      {range !== 'day' && (
      <div ref={gridRef} className="hidden overflow-hidden rounded-xl border md:block">
        {/* Weekdays repeat, so they head the columns and each cell names its own
            day. A year's columns don't repeat — the column *is* the month — so
            there's no axis to label and the name sits in the cell instead. */}
        {headings && (
          <div
            className="grid border-b bg-muted/40"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {headings.map((name) => (
              <div
                key={name}
                className="truncate px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {name}
              </div>
            ))}
          </div>
        )}
        {rows.map((row, ri) => {
          const laneCount = packed[ri].reduce((n, s) => Math.max(n, s.lane + 1), 0);
          return (
            <div key={row[0].from} className="relative border-b last:border-b-0">
              {/* The cells — the backdrop the bars are laid over. */}
              <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {row.map((cell) => {
                  const d = new Date(cell.from);
                  // Only a month has days that belong to a neighbour. Greying
                  // half a week row because the month turned would say the work
                  // on those days is somehow less real.
                  const outside = range === 'month' && d.getUTCMonth() !== monthIndex;
                  // A month cell is "today" for the whole month we're in — the
                  // same mark, at the resolution the column is drawn at.
                  const now = today >= cell.from && today <= cell.to;
                  return (
                    <div
                      key={cell.from}
                      className={cn(
                        'border-r px-1.5 pt-1.5 last:border-r-0',
                        // One week on screen gets the room five weeks can't have:
                        // its runs stack in full instead of being packed into a
                        // cell sized to fit a month on one page. A year is a
                        // single row, so it gets the same latitude.
                        range === 'month' ? 'min-h-[6rem]' : 'min-h-[16rem]',
                        outside && 'bg-muted/30',
                      )}
                      style={{ paddingBottom: laneCount * LANE_H + 6 }}
                    >
                      <span
                        className={cn(
                          'inline-grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs',
                          outside ? 'text-muted-foreground/60' : 'text-muted-foreground',
                          now && 'bg-primary font-semibold text-primary-foreground',
                        )}
                      >
                        {range === 'year'
                          ? d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' })
                          : d.getUTCDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* The bars, absolutely placed over the cells so a multi-cell event
                  is one continuous run rather than a chip repeated per cell. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-1.5 top-8">
                {packed[ri].map((seg) => {
                  const tint = seg.event.color ?? 'hsl(var(--muted-foreground))';
                  const active = hovered === seg.event.id;
                  const pct =
                    seg.event.progress === undefined
                      ? null
                      : Math.max(0, Math.min(100, Math.round(seg.event.progress)));
                  const people = seg.event.assignees ?? [];
                  const slots = barSlots(seg.span * colWidth - BAR_INSET, {
                    progress: pct !== null,
                    people: people.length,
                  });
                  return (
                    <button
                      key={`${seg.event.id}-${seg.col}`}
                      type="button"
                      title={seg.event.tooltip ?? seg.event.label}
                      onClick={seg.event.onClick}
                      // Focus counts as hover: tabbing through a month should light
                      // up the same run the pointer would.
                      onMouseEnter={() => setHovered(seg.event.id)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(seg.event.id)}
                      onBlur={() => setHovered(null)}
                      className={cn(
                        'pointer-events-auto absolute flex h-[18px] items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] font-medium leading-none transition-[background-color,box-shadow] outline-none',
                        seg.clipStart ? 'rounded-l-none' : 'rounded-l',
                        seg.clipEnd ? 'rounded-r-none' : 'rounded-r',
                      )}
                      style={{
                        left: `calc(${(seg.col / cols) * 100}% + ${BAR_INSET / 2}px)`,
                        width: `calc(${(seg.span / cols) * 100}% - ${BAR_INSET}px)`,
                        top: seg.lane * LANE_H,
                        color: tint,
                        // Highlight stays inside the event's own colour — a deeper
                        // pour of the same tint plus an inset edge. Nothing new is
                        // minted, so a hovered bar still reads as its own colour.
                        backgroundColor: pour(tint, active ? TINT.bar.hover : TINT.bar.rest),
                        // Inset, so lighting up a bar never nudges the lane below it.
                        boxShadow: active ? `inset 0 0 0 1px ${tint}` : undefined,
                      }}
                    >
                      <span
                        className="relative size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tint }}
                        aria-hidden
                      />
                      {/* `min-w-0` + shrink, but NOT `flex-1`: the cluster belongs
                          beside the title, not pinned to the far end of the bar.
                          A month-long run is a very wide strip, and pushed right
                          the meter and faces end up a hand's width from the thing
                          they describe — on the row *below* as far as the eye is
                          concerned. */}
                      <span className="relative min-w-0 truncate">{seg.event.label}</span>
                      {/* The run's own percentage, repeated on each week it
                          crosses — the same number every time, because it belongs
                          to the item, not to the slice of it you're looking at
                          (the label repeats for exactly the same reason). */}
                      {slots.progress && pct !== null && <MiniProgress pct={pct} />}
                      {slots.faces > 0 && (
                        <FaceStack people={people} faces={slots.faces} extra={slots.extra} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* ── Agenda: the Day range at any width, month and week below `md` ───── */}
      <div
        className={cn(
          'space-y-3',
          range === 'day'
            ? // A day's rows are lines of text, not boxes in a grid: run them to
              // the full width of a phone, but don't stretch one item's title
              // across a 27" screen.
              'mx-auto w-full max-w-3xl'
            : 'md:hidden',
        )}
      >
        {agenda.map(([cell, on]) => {
          const d = new Date(cell.from);
          const now = today >= cell.from && today <= cell.to;
          return (
            <div key={cell.from} className="rounded-xl border">
              <div
                className={cn('flex items-baseline gap-2 border-b px-3 py-2', now && 'bg-primary/5')}
              >
                {/* A month card is headed by its month; a day card by its date. */}
                <span className="text-sm font-semibold text-foreground">
                  {range === 'year'
                    ? d.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' })
                    : d.getUTCDate()}
                </span>
                <span className="text-xs text-muted-foreground">
                  {range === 'year'
                    ? d.getUTCFullYear()
                    : d.toLocaleDateString(locale, {
                        weekday: 'long',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                </span>
              </div>
              <ul className="divide-y">
                {on.map((event) => {
                  const tint = event.color ?? 'hsl(var(--muted-foreground))';
                  const pct =
                    event.progress === undefined
                      ? null
                      : Math.max(0, Math.min(100, Math.round(event.progress)));
                  const run = runLabel(event, locale);
                  return (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={event.onClick}
                      onMouseEnter={() => setHovered(event.id)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(event.id)}
                      onBlur={() => setHovered(null)}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left outline-none transition-colors hover:bg-accent/50',
                        // An item spanning a week has a row under each of those
                        // days; they light up together, same as the grid's bars.
                        hovered === event.id && 'bg-accent/50',
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tint }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {event.label}
                          </span>
                          {/* How long it runs — the one thing a row loses by not
                              being a bar. A month-long item and a one-day item
                              are the same shape here without it. */}
                          {run && (
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {run}
                            </span>
                          )}
                        </span>
                        {pct !== null && (
                          // A row here is as wide as the phone, so this gets the
                          // shape the item's own page uses — the app's bar, with
                          // the number beside it. The grid's ring is a *small
                          // space* answer, not a different reading.
                          <span className="mt-1 flex items-center gap-2">
                            <ProgressBar inline value={pct} className="h-1 flex-1" />
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {pct}%
                            </span>
                          </span>
                        )}
                        {event.meta && (
                          <span className="mt-1 flex flex-wrap items-center gap-1">{event.meta}</span>
                        )}
                      </span>
                    </button>
                  </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {agenda.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
            {empty?.hint && <p className="mt-1 text-sm text-muted-foreground">{empty.hint}</p>}
          </div>
        )}
      </div>

      {/* The grid always draws its days, even empty ones — a calendar with no
          boxes isn't a calendar — so the empty note sits under it rather than
          replacing it. The Day range has no grid, and says it above instead. */}
      {range !== 'day' && packed.every((row) => row.length === 0) && (
        <p className="mt-3 hidden text-center text-sm text-muted-foreground md:block">
          {emptyTitle}
          {empty?.hint && <span className="ml-1 text-muted-foreground/80">{empty.hint}</span>}
        </p>
      )}
    </>
  );
}

/** The ISO day an event falls on, for a caller that needs to filter its own
 *  fetch to the month on screen. Exported beside the view so the two agree on
 *  what "in this month" means. */
export function monthBounds(month: Date): { from: string; to: string } {
  const days = monthGrid(month);
  return { from: msDay(days[0]), to: msDay(days[days.length - 1]) };
}

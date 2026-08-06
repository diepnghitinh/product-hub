import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { BOARD_GUTTER } from './IssueBoardLayout';

/**
 * Shared, layout-matched skeleton loaders for main-content initial loads.
 *
 * A skeleton stands in for the *shape* of what's coming, so the page doesn't
 * jump when the data lands — that's the whole point over a centered spinner.
 * Each one here mirrors a real shell (the kanban board, an issue list, a detail
 * pane…), so drop the matching skeleton into the same slot the real content
 * will fill. They're intentionally neutral (`bg-muted` via `Skeleton`) — no
 * brand colour, because a skeleton isn't content.
 */

/** A card-shaped block that mirrors `KanbanCard`: title line(s) + a meta row. */
function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card p-3 shadow-sm">
      <Skeleton className="h-3 w-[85%]" />
      {lines > 1 && <Skeleton className="h-3 w-1/2" />}
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-3 w-8" />
      </div>
    </div>
  );
}

// A fixed, uneven spread of cards per column — reads more like a real board than
// an even grid, and stays stable across renders (no random reflow).
const COLUMN_CARDS = [3, 2, 4, 2, 3];

/**
 * The kanban board mid-load: a row of tinted columns, each with a pill header +
 * count and a few card skeletons. Mirrors `KanbanBoard`'s layout exactly, so it
 * occupies the same footprint the real board will. Sits in a board's content
 * slot (below the shared `IssueBoardLayout` chrome, which stays visible).
 */
export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-start sm:overflow-x-hidden md:px-8 md:py-6">
      {Array.from({ length: columns }).map((_, ci) => (
        <div
          key={ci}
          className="flex min-h-[120px] flex-col gap-3 rounded-xl bg-muted/30 p-3 sm:w-[280px] sm:shrink-0"
        >
          <div className="flex items-center gap-2 px-0.5 pt-0.5">
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-4 w-5" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: COLUMN_CARDS[ci % COLUMN_CARDS.length] }).map((__, k) => (
              <CardSkeleton key={k} lines={(ci + k) % 3 === 0 ? 1 : 2} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// A fixed, uneven spread of bars per week row — enough to read as a calendar
// with work on it, and stable across renders.
const WEEK_BARS = [
  [
    { from: 1, span: 3 },
    { from: 5, span: 2 },
  ],
  [
    { from: 0, span: 2 },
    { from: 3, span: 4 },
  ],
  [
    { from: 2, span: 1 },
    { from: 4, span: 3 },
  ],
  [{ from: 0, span: 5 }],
  [{ from: 3, span: 2 }],
];

/**
 * The calendar mid-load: the weekday strip over a grid of day cells with a few
 * spanning bars. Mirrors `CalendarGrid` — same seven columns, same day-number
 * corner, same bar height — so the real grid lands without the page moving.
 */
export function CalendarSkeleton({ weeks = 5 }: { weeks?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-7 border-y">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={cn('flex justify-center px-2 py-2', i < 6 && 'border-r')}>
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {Array.from({ length: weeks }).map((_, w) => (
          <div key={w} className="relative grid min-h-[104px] flex-1 grid-cols-7 border-b">
            {Array.from({ length: 7 }).map((__, d) => (
              <div key={d} className={cn('p-1.5', d < 6 && 'border-r')}>
                <Skeleton className="size-[18px] rounded-full" />
              </div>
            ))}
            <div className="pointer-events-none absolute inset-0">
              {WEEK_BARS[w % WEEK_BARS.length].map((bar, i) => (
                <div
                  key={i}
                  className="absolute px-[3px]"
                  style={{
                    left: `${(bar.from / 7) * 100}%`,
                    width: `${(bar.span / 7) * 100}%`,
                    top: 26 + i * 23,
                  }}
                >
                  <Skeleton className="h-[19px] w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One issue-list row: leading dot, title, and a couple of trailing chips. */
function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-3">
      <Skeleton className="size-3.5 shrink-0 rounded-full" />
      <Skeleton className="h-3.5 min-w-0 flex-1 max-w-[min(60%,28rem)]" />
      <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
      <Skeleton className="h-5 w-12 rounded-full" />
      <Skeleton className="size-6 shrink-0 rounded-full" />
    </div>
  );
}

/**
 * A vertical list of issue-like rows — for list views (My Issues list, a task
 * list). `inset` adds the board gutter so it lines up with a board's toolbar;
 * omit it inside a panel that already has its own padding.
 */
export function ListSkeleton({ rows = 8, inset = false }: { rows?: number; inset?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-2 pb-6', inset && BOARD_GUTTER)}>
      {Array.from({ length: rows }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  );
}

// Staggered bar offsets/widths (in %), fixed so the timeline reads like a real
// schedule and stays stable across renders.
const TIMELINE_BARS: Array<[number, number]> = [
  [8, 40],
  [24, 32],
  [4, 28],
  [36, 44],
  [16, 36],
  [48, 30],
  [12, 52],
];

/**
 * The timeline (Gantt) view mid-load: rows of a left-hand label + a bar floated
 * along a track. Matches the board pages' `timeline` view, so it drops into the
 * same content slot (below the shared chrome, which stays visible).
 */
export function TimelineSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className={cn('flex flex-col gap-3 pb-6 pt-2', BOARD_GUTTER)}>
      {Array.from({ length: rows }).map((_, i) => {
        const [offset, width] = TIMELINE_BARS[i % TIMELINE_BARS.length];
        return (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-3.5 w-32 shrink-0 sm:w-40" />
            <div className="relative h-7 flex-1 rounded-md bg-muted/30">
              <Skeleton
                className="absolute top-1 h-5 rounded-md"
                style={{ left: `${offset}%`, width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A bordered `divide-y` list of rows — for admin settings lists (teams, team
 * statuses, API keys) that render a leading glyph, a label, and a trailing
 * control. Brings its own card container, so it stands alone in the slot.
 */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-xl border bg-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** A single content card for a responsive grid (roadmaps, projects, OKRs). */
function GridCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="mt-1 flex items-center justify-between">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="size-6 rounded-full" />
      </div>
    </div>
  );
}

/**
 * A responsive grid of content cards. Uses the same auto-fill track as the app's
 * shared `CARD_GRID` (min 260px columns), so the skeleton tiles land exactly
 * where the real cards will — no reflow when the data arrives.
 */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {Array.from({ length: cards }).map((_, i) => (
        <GridCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A row of headline stat tiles (dashboard, cycle insights). */
export function StatCardsSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: tiles }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

/** A simple table body: a header line then evenly-spaced rows (admin lists). */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3.5', i === 0 ? 'w-40' : 'w-24')} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
          <div className="flex min-w-0 flex-[2] items-center gap-2.5">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
          </div>
          {Array.from({ length: cols - 1 }).map((_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A detail-page pane mid-load. Mirrors the shared `DetailGrid` (issue / roadmap-
 * item detail): a main column — short-id, title, a few body lines, an editor
 * block — beside a fixed 260px properties column that drops below on mobile.
 * Drop it into the same content slot the real detail fills.
 */
/**
 * A page of prose mid-load — paragraphs of uneven line lengths broken by a
 * heading. For a doc page waiting on its first sync from the collaboration
 * server: it holds the column's width and rhythm so the real text lands where
 * the grey lines were instead of pushing the page down.
 *
 * Deliberately ragged and fixed (not random), so it reads as writing rather than
 * a grid, and doesn't reshuffle on every render.
 */
const PROSE_LINES = ['100%', '96%', '88%', '', '92%', '100%', '78%', '', '100%', '84%'];

export function ProseSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-1" aria-hidden>
      {PROSE_LINES.map((width, i) =>
        // An empty entry is a paragraph break — a taller gap, no line.
        width ? (
          <Skeleton key={i} className="h-4" style={{ width }} />
        ) : (
          <Skeleton key={i} className="mt-3 h-5 w-40" />
        ),
      )}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <div className="flex flex-col gap-2.5 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="mt-2 h-48 w-full rounded-lg" />
      </div>
      <div className="flex flex-col gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

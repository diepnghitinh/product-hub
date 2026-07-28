import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { t } from '@/i18n';
import { PersonAvatar, WorkloadCard } from './WorkloadCard';
import type { PersonWorkload } from './workload';

/** Narrowest a workload card still reads well at, and the gutter between them (px). */
const MIN_CARD = 296;
const GAP = 16;
/** Cards get wide and sparse past this — cap the grid instead. */
const MAX_COLUMNS = 4;

/**
 * The "who's carrying what" cell — a vertical bar per person (their load relative to
 * the busiest), avatar beneath, like the reference. Fills its grid cell so it reads
 * the same height as the person cards beside it. Only worth showing with >1 person.
 */
function WorkloadSummary({ people }: { people: PersonWorkload[] }) {
  const maxTotal = Math.max(...people.map((p) => p.total), 1);
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <h2 className="shrink-0 text-sm font-semibold text-foreground">{t('myteam.workload')}</h2>
      <div className="mt-4 flex min-h-0 flex-1 items-stretch gap-1.5">
        {people.map((person) => {
          const pct = Math.max(Math.round((person.total / maxTotal) * 100), 6);
          return (
            <div key={person.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className="flex h-full w-2.5 items-end overflow-hidden rounded-full bg-primary/10"
                  title={`${person.name}: ${person.total}`}
                >
                  <div
                    className="w-full rounded-full bg-primary transition-[height] duration-500"
                    style={{ height: `${pct}%` }}
                  />
                </div>
              </div>
              <PersonAvatar name={person.name} unassigned={person.isUnassigned} size={24} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * How many columns fit. Measured from the **container**, not the viewport, so the
 * grid also reflows when the sidebar collapses. Read once in a layout effect (before
 * paint, so there's no one-column flash) and then on every resize.
 */
function useColumnCount(ref: RefObject<HTMLElement>) {
  const [count, setCount] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number) =>
      setCount(Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + GAP) / (MIN_CARD + GAP)))));
    measure(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return count;
}

/**
 * The Box view: a masonry of cards — the Workload chart takes the first slot, then a
 * card per person, filling across the columns and wrapping back under the chart (the
 * reference's packing). Cards take their natural height and the PAGE scrolls, so
 * opening a status shows the whole list with no nested scrollbar.
 *
 * Columns are laid out in JS rather than with CSS `columns` on purpose: CSS would
 * re-balance every column when one card grows, so opening a status would shuffle
 * *other* people's cards around the screen. Here a card only ever grows its own column.
 */
export function TeamWorkloadView({ people }: { people: PersonWorkload[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount(containerRef);

  // Unassigned rides up front (right after the Workload chart), then the real people.
  const ordered = useMemo(() => {
    const unassigned = people.filter((p) => p.isUnassigned);
    const assigned = people.filter((p) => !p.isUnassigned);
    return [...unassigned, ...assigned];
  }, [people]);

  const showChart = people.length > 1;

  // Deal the cards across columns, left to right. The chart holds column 0's first
  // slot, so people start one place along and wrap back beneath it.
  const columns = useMemo(() => {
    const cols: PersonWorkload[][] = Array.from({ length: columnCount }, () => []);
    ordered.forEach((person, i) => {
      cols[(i + (showChart ? 1 : 0)) % columnCount].push(person);
    });
    return cols;
  }, [ordered, columnCount, showChart]);

  return (
    <div ref={containerRef} className="flex items-start gap-4">
      {columns.map((column, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
          {i === 0 && showChart && (
            <div className="h-[300px]">
              {/* Chart bars follow the card order — Unassigned first (position 0). */}
              <WorkloadSummary people={ordered} />
            </div>
          )}
          {column.map((person) => (
            <WorkloadCard key={person.id} person={person} />
          ))}
        </div>
      ))}
    </div>
  );
}

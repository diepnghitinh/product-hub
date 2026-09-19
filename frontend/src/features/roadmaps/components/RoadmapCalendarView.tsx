import { useState, type ReactNode } from 'react';
import { Target } from 'lucide-react';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { AssigneeBadge } from '@/components/AssigneeBadge';
import { CalendarView, type CalendarEvent } from '@/components/CalendarView';
import { GanttChip } from '@/components/GanttChart';
import { useCalendarPeriod } from '@/components/filterParams';
import { ROADMAP_ITEM_STATUS_COLOR, ROADMAP_ITEM_STATUS_LABEL } from '@/types/enums';
import type { RoadmapColumn, RoadmapItem, TaskDto } from '@/types/dto';
import { sprintChipLabel, type RoadmapSprint, type SprintScope } from '../useRoadmapSprints';
import { chartedItems, isoDay, itemColor, itemWindow } from './RoadmapGanttView';
import { RoadmapItemPeekDrawer, type RoadmapItemPeek } from './RoadmapItemPeekDrawer';

interface RoadmapCalendarViewProps {
  /** Where the peek drawer reads from. Omit together with `onOpenItem` — the
   *  public share has no roadmap id to fetch with and opens its own dialog. */
  roadmapId?: string;
  /** The items in scope — narrowed to the "Now" column here unless a sprint
   *  scope has already picked them, exactly as the Gantt narrows them. */
  items: RoadmapItem[];
  columns: RoadmapColumn[];
  /** Tasks linked to each item, keyed by `roadmapItemId` — only used to derive an
   *  item's end date when it has none of its own (see `itemWindow`). Omit (public
   *  share) and an item falls back to its own dates. */
  tasksByItem?: Map<string, TaskDto[]>;
  /** An item's sprints (derived from its tasks) — for its chip in the agenda. */
  sprintsForItem?: (itemId: string) => RoadmapSprint[];
  scope?: SprintScope;
  groupBySprint?: boolean;
  /** The board's Filter menu has narrowed `items` — like a scope, it means the
   *  reader has picked what they want, so the calendar stops narrowing to "Now"
   *  on their behalf (see `chartedItems`). */
  filtered?: boolean;
  /** Opens an item some other way (the public share's read-only dialog) instead
   *  of this view's own peek drawer, which needs an account. */
  onOpenItem?: (item: RoadmapItem) => void;
  isLoading?: boolean;
  /** The Gantt ↔ Calendar switch, pinned to the right of the month controls —
   *  the same slot, visually, that the Gantt gives it on its legend row. */
  toolbar?: ReactNode;
}

/**
 * The roadmap timeline as a **month calendar** — the read-only half of the
 * Timeline tab.
 *
 * Same items, same window, same colours as `RoadmapGantt`; only the question
 * changes, from "how do these run against each other?" to "what is happening on
 * the 14th?". Both readings are derived through the *shared* `itemWindow` and
 * `chartedItems` helpers, so switching the toggle can never move an item or
 * quietly change which ones you are looking at.
 *
 * **Read-only by design.** The Gantt is where dates are edited: a bar drags to a
 * new window and its edges resize. Nothing here writes — a calendar cell is a
 * day-wide target, so a drag would round a carefully-set date to whichever box
 * the pointer landed in. Clicking an item still *peeks* it in the same drawer the
 * Gantt opens, which is reading, not editing, and the item's own page is one
 * click further on.
 *
 * **Items only, no linked tasks.** A cycle routinely holds 15 items and 60
 * tasks; drawn together in one month that is unreadable. This is the folded
 * reading the Gantt's "Collapse all" gives you — "which item lands when?" — and
 * a task's own dates are still on the team boards' Calendar tab.
 */
export function RoadmapCalendarView({
  roadmapId,
  items,
  columns,
  tasksByItem,
  sprintsForItem,
  scope,
  groupBySprint,
  filtered,
  onOpenItem,
  isLoading,
  toolbar,
}: RoadmapCalendarViewProps) {
  const { range, anchor, setRange, setAnchor } = useCalendarPeriod();
  const [peek, setPeek] = useState<RoadmapItemPeek | null>(null);

  const open =
    onOpenItem ??
    ((item: RoadmapItem) =>
      setPeek({
        roadmapId: roadmapId ?? '',
        itemId: item.id,
        href: `/roadmaps/${roadmapId}/items/${item.shortId || item.id}`,
      }));

  const narrowed = !!groupBySprint || !!filtered || (!!scope && scope.kind !== 'all');
  const shown = chartedItems(items, columns, narrowed);

  const events: CalendarEvent[] = shown.map((item) => {
    const { start, end } = itemWindow(item, tasksByItem?.get(item.id) ?? []);
    // The item's own colour, from the same helper the Gantt's bar uses — so one
    // item is one colour whichever way you look at the timeline.
    const color = itemColor(item);
    const title = item.title || t('roadmaps.untitled');
    const range =
      isoDay(start) === isoDay(end)
        ? formatDate(new Date(start))
        : `${formatDate(new Date(start))} – ${formatDate(new Date(end))}`;
    const itemSprints = sprintsForItem?.(item.id) ?? [];

    return {
      id: item.id,
      label: title,
      color,
      // A small progress bar at the end of the bar — the same shape the item's
      // own page shows it in, so "how far along?" needs no legend.
      progress: item.progress,
      // The month grid draws up to three faces here and names everyone on
      // hover; the agenda below `md` keeps naming them through `meta`'s badge
      // instead, where a row has the width for a name.
      assignees: item.assignees,
      start: isoDay(start),
      end: isoDay(end),
      tooltip: `${title} · ${range} · ${item.progress}%`,
      onClick: () => open(item),
      // Only the small-screen agenda renders this — a bar in the month grid is
      // one line tall by design, and its chips live in the tooltip there.
      meta: (
        <>
          <GanttChip color={ROADMAP_ITEM_STATUS_COLOR[item.status]}>
            {ROADMAP_ITEM_STATUS_LABEL[item.status]}
          </GanttChip>
          {itemSprints.length > 0 && (
            <GanttChip title={itemSprints.map((s) => s.label).join(' · ')}>
              {sprintChipLabel(itemSprints)}
            </GanttChip>
          )}
          <GanttChip title="RICE score">
            <span className="font-mono">{item.rice}</span>
          </GanttChip>
          {item.okrLabel && (
            <GanttChip
              title={item.okrLabel}
              icon={<Target className="size-3 shrink-0 text-primary" aria-hidden />}
            >
              {item.okrLabel}
            </GanttChip>
          )}
          {item.assignees.length > 0 && (
            <AssigneeBadge
              assignees={item.assignees}
              unassignedLabel={t('tasks.unassigned')}
              className="max-w-[160px] py-0 text-[11px] font-medium"
            />
          )}
        </>
      ),
    };
  });

  return (
    <>
      <CalendarView
        anchor={anchor}
        onAnchorChange={setAnchor}
        // Year · Month · Week · Day. A roadmap item routinely runs for weeks or
        // months, which is too long for a month grid to hold: it fills the whole
        // page and you can't tell a six-week run from a six-month one. **Year**
        // is the reading for that — twelve month columns, so a bar's length is
        // its length in months. Week and Day zoom the other way, for the days
        // inside a busy cell.
        range={range}
        onRangeChange={setRange}
        events={events}
        isLoading={isLoading}
        empty={{ title: t('roadmaps.calendarEmpty'), hint: t('roadmaps.calendarEmptyHint') }}
        toolbar={toolbar}
      />
      {/* Only when this view opens items itself. A public share has no account to
          fetch a detail with, so it hands us `onOpenItem` and shows its own dialog. */}
      {!onOpenItem && <RoadmapItemPeekDrawer peek={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

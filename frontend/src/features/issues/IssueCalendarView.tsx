import { useState } from 'react';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { AssigneeBadge } from '@/components/AssigneeBadge';
import { CalendarView, type CalendarEvent } from '@/components/CalendarView';
import { GanttChip } from '@/components/GanttChart';
import { useCalendarPeriod } from '@/components/filterParams';
import { LabelChips } from '@/features/labels/LabelChips';
import { TeamChip, type TeamChipTeam } from '@/features/teams/TeamChip';
import { useTeamLabelsLookup, useTeamLookup, useTeamStatusesLookup } from '@/features/teams/api';
import {
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  TeamIssueType,
  type TaskLabelConfig,
  type TeamStatusConfig,
} from '@/types/enums';
import type { IssueTimelineItem } from './IssueTimelineView';
import { IssuePeekDrawer, type IssuePeek } from './IssuePeekDrawer';

interface IssueCalendarViewProps {
  items: IssueTimelineItem[];
  /** Picks the status-colour source and the detail route (`/tasks` vs `/bugs`). */
  issueType: TeamIssueType;
  isLoading?: boolean;
  /** Overrides the per-team status lookup, and skips its authenticated `/teams`
   *  fetch — for a caller (e.g. a public board) that already has its one team's
   *  statuses in hand. */
  statusesFor?: (teamId: string | undefined, issueType: TeamIssueType) => TeamStatusConfig[];
  /** The same escape hatch for the label chips. */
  labelsFor?: (teamId: string | undefined) => TaskLabelConfig[];
  /** …and for the team chip. */
  teamFor?: (teamId: string | undefined) => TeamChipTeam | undefined;
  /** Overrides what an event opens (e.g. the public board's read-only dialog)
   *  instead of this view's own peek drawer, which needs an account. */
  onOpenItem?: (item: IssueTimelineItem) => void;
}

/** The end an issue is drawn to — `endDate`, else the legacy `dueDate` mirror,
 *  the same fallback the timeline bar uses. */
const endOf = (i: IssueTimelineItem) => i.endDate || i.dueDate || undefined;

/**
 * A **calendar** of a team's issues — the same rows the Timeline tab draws,
 * asked the other question: not "how do these run against each other?" but "what
 * is on next Tuesday?". Month, week or day, held in the URL like every other
 * board state.
 *
 * A thin adapter over the shared `<CalendarView>`, written to mirror
 * `IssueTimelineView` field for field (same items, same lookup overrides, same
 * peek drawer), so a board adds the tab by passing the rows it already has.
 *
 * Issues with **no dates** are left out rather than parked somewhere: a calendar
 * places things in time, and an undated issue has no place in it. They are all
 * still on the board, the list and the timeline, which is where an unscheduled
 * backlog belongs.
 *
 * Clicking an event **peeks** it in a drawer rather than navigating, for the same
 * reason the timeline does — leaving the month to read one issue loses the month.
 */
export function IssueCalendarView({
  items,
  issueType,
  isLoading,
  statusesFor: statusesForOverride,
  labelsFor: labelsForOverride,
  teamFor: teamForOverride,
  onOpenItem,
}: IssueCalendarViewProps) {
  // Same hooks either way (rules of hooks) — `enabled` just skips their fetch
  // when the caller supplies its own lookup.
  const statusesForHook = useTeamStatusesLookup(!statusesForOverride);
  const labelsForHook = useTeamLabelsLookup(!labelsForOverride);
  const teamForHook = useTeamLookup(!teamForOverride);
  const statusesFor = statusesForOverride ?? statusesForHook;
  const labelsFor = labelsForOverride ?? labelsForHook;
  const teamFor = teamForOverride ?? teamForHook;
  const { range, anchor, setRange, setAnchor } = useCalendarPeriod();
  const [peek, setPeek] = useState<IssuePeek | null>(null);

  // Name the team only on a board whose rows actually span teams — the same rule
  // the timeline's rail follows.
  const showTeam = new Set(items.map((i) => i.teamId).filter(Boolean)).size > 1;

  const open =
    onOpenItem ??
    ((issue: IssueTimelineItem) =>
      setPeek({ id: issue.id, issueType, href: `/issues/${issue.shortId || issue.id}` }));

  const events: CalendarEvent[] = items
    .filter((i) => i.startDate || endOf(i))
    .map((issue) => {
      const cfg = statusesFor(issue.teamId, issueType).find((c) => c.key === issue.status);
      const color = cfg?.color ?? 'hsl(var(--muted-foreground))';
      const statusLabel = cfg?.label ?? issue.status;
      const start = issue.startDate;
      const end = endOf(issue);
      const when =
        start && end && start.slice(0, 10) !== end.slice(0, 10)
          ? `${formatDate(start)} – ${formatDate(end)}`
          : formatDate((start || end) as string);

      return {
        id: issue.id,
        label: issue.title,
        color,
        // Up to three faces on the bar, everyone named on hover. No `progress`:
        // an issue is done or it isn't, so there is no percentage to draw.
        assignees: issue.assignees ?? [],
        start,
        end,
        tooltip: `${issue.title} · ${when} · ${statusLabel}`,
        onClick: () => open(issue),
        // Only the agenda renders this — the month grid's bars are one line tall
        // by design, and the chips live in the tooltip there.
        meta: (
          <>
            {issue.shortId && (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{issue.shortId}</span>
            )}
            {showTeam && <TeamChip team={teamFor(issue.teamId)} />}
            <GanttChip color={color}>{statusLabel}</GanttChip>
            {issue.severity && (
              <GanttChip color={BUG_SEVERITY_COLOR[issue.severity]} title={t('bugs.severity')}>
                {BUG_SEVERITY_LABEL[issue.severity]}
              </GanttChip>
            )}
            <LabelChips keys={issue.labelKeys} labels={labelsFor(issue.teamId)} max={2} />
            {issue.assignees && issue.assignees.length > 0 && (
              <AssigneeBadge
                assignees={issue.assignees}
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
        range={range}
        onRangeChange={setRange}
        events={events}
        isLoading={isLoading}
        empty={{ title: t('calendar.empty'), hint: t('calendar.emptyHint') }}
      />
      {/* Never opened when the caller passed `onOpenItem` — a public board has no
          account to fetch a detail with, and opens its own dialog instead. */}
      <IssuePeekDrawer peek={peek} onClose={() => setPeek(null)} />
    </>
  );
}

import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { GanttChart, firstEpoch, isEpoch, toEpoch, type GanttRow } from '@/components/GanttChart';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { TeamIssueType } from '@/types/enums';

/**
 * The subset of a task/bug a timeline row needs. Both `TaskDto` and `BugDto`
 * satisfy it structurally (bugs simply have no `dueDate`), so a board can pass
 * its rows straight in.
 */
export interface IssueTimelineItem {
  id: string;
  shortId?: string;
  title: string;
  status: string;
  teamId?: string;
  startDate?: string;
  endDate?: string;
  /** Task-only legacy alias of `endDate`; used as an end fallback when present. */
  dueDate?: string;
}

interface IssueTimelineViewProps {
  items: IssueTimelineItem[];
  /** Picks the status-colour source and the detail route (`/tasks` vs `/bugs`). */
  issueType: TeamIssueType;
  isLoading?: boolean;
}

/** The date that anchors a row's position — its start, else its end. */
function anchor(i: IssueTimelineItem): number {
  const s = toEpoch(i.startDate);
  return isEpoch(s) ? s : firstEpoch(i.endDate, i.dueDate);
}

/**
 * A schedule timeline for a team's issues (tasks or bugs): one row per issue,
 * drawn as a **bar** from its start to its end date, coloured by the issue's own
 * team status. An issue with only one of the two dates shows a **diamond** on
 * that date; an issue with neither is listed but not placed. A thin adapter over
 * the shared `<GanttChart>` — the same surface the roadmap timeline uses.
 */
export function IssueTimelineView({ items, issueType, isLoading }: IssueTimelineViewProps) {
  const statusesFor = useTeamStatusesLookup();
  const base = issueType === TeamIssueType.BUG ? 'bugs' : 'tasks';

  // Dated first (soonest at the top), undated last — a stable, useful order.
  const ordered = [...items].sort((a, b) => {
    const aa = anchor(a);
    const bb = anchor(b);
    if (isEpoch(aa) && isEpoch(bb)) return aa - bb;
    return isEpoch(aa) ? -1 : isEpoch(bb) ? 1 : 0;
  });

  const rows: GanttRow[] = ordered.map((issue) => {
    const start = toEpoch(issue.startDate);
    const end = firstEpoch(issue.endDate, issue.dueDate);
    const cfg = statusesFor(issue.teamId, issueType).find((c) => c.key === issue.status);
    const color = cfg?.color ?? 'hsl(var(--muted-foreground))';
    const statusLabel = cfg?.label ?? issue.status;

    const row: GanttRow = {
      id: issue.id,
      label: issue.title,
      sublabel: issue.shortId ? `${issue.shortId} · ${statusLabel}` : statusLabel,
      dotColor: color,
      href: `/${base}/${issue.shortId || issue.id}`,
    };

    if (isEpoch(start) && isEpoch(end)) {
      const range = `${formatDate(new Date(start))} – ${formatDate(new Date(end))}`;
      row.bar = { start, end, color, tooltip: `${issue.title} · ${range} · ${statusLabel}` };
    } else if (isEpoch(end)) {
      row.marker = { at: end, color, tooltip: `${issue.title} · ${formatDate(new Date(end))} · ${statusLabel}` };
    } else if (isEpoch(start)) {
      row.marker = { at: start, color, tooltip: `${issue.title} · ${formatDate(new Date(start))} · ${statusLabel}` };
    } else {
      row.emptyText = t('boards.timelineNoDates');
    }
    return row;
  });

  return (
    <GanttChart
      rows={rows}
      isLoading={isLoading}
      labelHeader={t('boards.timelineIssue')}
      empty={{ title: t('boards.timelineEmpty'), hint: t('boards.timelineEmptyHint') }}
      legend={
        <>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded-full bg-muted-foreground" aria-hidden />
            {t('boards.timelineLegendBar')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rotate-45 rounded-[2px] bg-muted-foreground" aria-hidden />
            {t('boards.timelineLegendMarker')}
          </span>
        </>
      }
    />
  );
}

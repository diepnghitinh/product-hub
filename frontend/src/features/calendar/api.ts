import { useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { usePersonalStatuses, useTasks } from '@/features/tasks/api';
import { useTeamStatusesLookup } from '@/features/teams/api';
import { TeamIssueType } from '@/types/enums';
import type { TaskDto } from '@/types/dto';

/**
 * The two kinds of work the calendar can draw. Neither is a new endpoint: they
 * are the exact queries the **Personal List** and **Assigned to me** pages
 * already run, so the calendar shows the same tasks those pages do and shares
 * their react-query cache — open either page and the calendar is already warm.
 */
export const CALENDAR_SOURCES = ['personal', 'assigned'] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

/** A task on the calendar, tagged with where it came from. */
export interface CalendarTask extends TaskDto {
  /** `personal` = private, owned by me, in no team (drawn with the lock). */
  source: CalendarSource;
}

/**
 * Every task the calendar can draw, for the chosen sources.
 *
 * Both queries run whichever sources are on. They're the same two the sidebar's
 * own pages fetch, so the second one is usually already cached, and keeping them
 * mounted is what makes the source toggle instant instead of a spinner each way.
 *
 * A task can only ever come from one source in practice — a personal task has an
 * owner and no team, so it can't also be a team task assigned to you — but the
 * merge is by id regardless, so nothing can be drawn twice if that ever changes.
 * Personal wins the tie, because "this is private" is the fact worth showing.
 */
export function useCalendarTasks(sources: CalendarSource[]) {
  const { user } = useAuth();
  const personal = useTasks({ personal: true });
  // Matches the "Assigned to me" board exactly (strict assignee, all teams).
  const assigned = useTasks({ mine: user?.id ?? '__none__' });

  const wantPersonal = sources.includes('personal');
  const wantAssigned = sources.includes('assigned');

  const items = useMemo(() => {
    const byId = new Map<string, CalendarTask>();
    if (wantAssigned) {
      for (const task of assigned.data?.items ?? [])
        byId.set(task.id, { ...task, source: 'assigned' });
    }
    if (wantPersonal) {
      for (const task of personal.data?.items ?? [])
        byId.set(task.id, { ...task, source: 'personal' });
    }
    return [...byId.values()];
  }, [assigned.data, personal.data, wantAssigned, wantPersonal]);

  return {
    items,
    // Only the sources actually being drawn can hold the grid back — turning
    // "Assigned to me" off shouldn't leave you watching its query load.
    isLoading: (wantPersonal && personal.isLoading) || (wantAssigned && assigned.isLoading),
  };
}

/**
 * A task's colour on the calendar — its own board column's, never a palette
 * invented here. A personal task resolves against the caller's personal columns
 * and a team task against its team's, which is the same rule the kanban boards
 * follow, so a task is the same colour wherever you meet it. Both configs are
 * already cached (the sidebar fetches `/teams`; the personal board its columns),
 * so this costs no extra request.
 */
export function useStatusColor(): (task: CalendarTask) => string {
  const { data: personalStatuses } = usePersonalStatuses();
  const teamStatuses = useTeamStatusesLookup();

  return (task) => {
    const columns =
      task.source === 'personal'
        ? (personalStatuses ?? [])
        : teamStatuses(task.teamId, TeamIssueType.TASK);
    // A column the user has since renamed away leaves the task without one —
    // grey is the honest answer, not a guess at which column it "meant".
    return columns.find((c) => c.key === task.status)?.color ?? 'hsl(var(--muted-foreground))';
  };
}

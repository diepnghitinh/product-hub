import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MultiSelect } from '@/components/ui';
import { TimelineSkeleton } from '@/components/Skeletons';
import { BOARD_GUTTER } from '@/components/IssueBoardLayout';
import { BackLink } from '@/components/BackLink';
import { FilterMenu, assigneeFilterCategory, type FilterCategory } from '@/components/FilterMenu';
import { SavedFilterChips, useSavedFilters } from '@/components/SavedFilters';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useUsers } from '@/features/users/api';
import { useRoadmaps } from './api';
import { AllRoadmapsGanttView, unionColumns } from './components/AllRoadmapsGanttView';

/**
 * The Timeline tab of the planning page (`PlanningPage`) — every roadmap's items
 * on one date axis, with the work linked to them underneath.
 *
 * A *panel*, not a page: like `RoadmapsPanel` it publishes its own title through
 * `PageHeader`, and the page above owns only the tab strip.
 *
 * **It's shaped like a board's timeline, because it is one.** The layout below is
 * the team board's `?view=timeline` (`MyTasksPage`) part for part: a toolbar of
 * only what narrows the list, inset on the shared gutter so it lines up with the
 * topbar, then the chart in a full-height area that scrolls on its own while the
 * header and toolbar stay put. Two timelines in one product should not need two
 * layouts — and this is the one every other board already uses.
 */
export function RoadmapTimelinePanel() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const projectId = params.get('projectId') || undefined;
  const projectName = params.get('project') || undefined;
  const { data, isLoading } = useRoadmaps();
  // Shared with every `AssigneeField` on the page — same key, one fetch.
  const { data: usersData } = useUsers({ limit: 100 });

  // Who's on the work, remembered per browser and saveable as a named view — the
  // same Filter control every board carries. It's *not* in the URL, unlike the
  // phase filter below: a phase is what the plan is, and a link to "Now across
  // every roadmap" is worth sending; whose work you're looking at is a lens you
  // put on and take off, which is exactly what a saved filter is for.
  //
  // One slot for this board, narrowed or not: `?projectId=` is the same timeline
  // scoped down, so it deliberately shares the remembered set.
  const filterState = useSavedFilters('roadmaps:timeline');
  const { filters, setFilters } = filterState;
  const filterCategories: FilterCategory[] = [assigneeFilterCategory(usersData?.items, user?.id)];

  const roadmaps = useMemo(
    () => (data ?? []).filter((r) => !projectId || r.projectId === projectId),
    [data, projectId],
  );

  // The phase columns to draw, pooled across every roadmap on screen.
  const phaseColumns = useMemo(() => unionColumns(roadmaps), [roadmaps]);
  // Default to "Now" — every roadmap's most-immediate column, and the only one
  // the per-roadmap timeline has ever drawn. Opening the view on all three
  // phases at once would be a wall of rows before you'd asked for one.
  const defaultPhases = useMemo(() => {
    const now = phaseColumns.find((c) => c.key === 'now') ?? phaseColumns[0];
    return now ? [now.key] : [];
  }, [phaseColumns]);
  // Absent → the default. Present but empty (`?phase=`) → deliberately none, which
  // is a state you can reach by clearing the filter and must therefore survive a
  // reload rather than silently springing back to "Now".
  const phaseParam = params.get('phase');
  const phases = phaseParam === null ? defaultPhases : phaseParam ? phaseParam.split(',') : [];
  const setPhases = (next: string[]) => {
    const p = new URLSearchParams(params);
    const isDefault =
      next.length === defaultPhases.length && next.every((k) => defaultPhases.includes(k));
    if (isDefault) p.delete('phase');
    else p.set('phase', next.join(','));
    setParams(p, { replace: true });
  };

  // Same title as the Roadmaps tab: they're two views of one thing, and a crumb
  // that changed under you when you switched tabs would say otherwise.
  const title = projectName ? `${t('roadmaps.title')} — ${projectName}` : t('roadmaps.title');
  const hasRoadmaps = isLoading || roadmaps.length > 0;

  return (
    <>
      <PageHeader title={title} />

      {projectId && (
        <div className={cn('shrink-0 pt-6', BOARD_GUTTER)}>
          <BackLink to={`/testing/${projectId}`}>{projectName || t('nav.projects')}</BackLink>
        </div>
      )}

      {/* The toolbar row: only what narrows the list, on the same gutter as every
          board's — so the filter sits under the topbar's left edge. */}
      {hasRoadmaps && (
        <div
          className={cn(
            'mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center',
            projectId ? 'mt-2' : 'pt-4',
            BOARD_GUTTER,
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('roadmaps.phase')}</span>
            <MultiSelect
              className="w-auto min-w-[200px] max-w-full"
              options={phaseColumns.map((c) => ({
                value: c.key,
                text: c.label,
                label: (
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                      aria-hidden
                    />
                    {c.label}
                  </span>
                ),
              }))}
              value={phases}
              onChange={setPhases}
              placeholder={t('roadmaps.phaseNone')}
              maxDisplay={2}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <FilterMenu
              size="default"
              categories={filterCategories}
              value={filters}
              onChange={setFilters}
            />
            <SavedFilterChips state={filterState} categories={filterCategories} />
          </div>
        </div>
      )}

      {isLoading ? (
        <TimelineSkeleton />
      ) : roadmaps.length === 0 ? (
        // The chart below is only ever handed a non-empty list: an empty
        // `roadmapId` filter would mean "every issue in the workspace".
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center text-muted-foreground md:mx-8">
          {t('roadmaps.empty')}
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6 pt-1', BOARD_GUTTER)}>
          <AllRoadmapsGanttView
            roadmaps={roadmaps}
            phases={phases}
            assigneeIds={filters.assigneeId}
          />
        </div>
      )}
    </>
  );
}

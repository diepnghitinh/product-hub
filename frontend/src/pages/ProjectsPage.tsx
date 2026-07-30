import { useMemo, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Input, ProgressBar } from '@/components/ui';
import { FilterMenu, countFilters, type FilterSelections } from '@/components/FilterMenu';
import { CardGridSkeleton } from '@/components/Skeletons';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { ENVIRONMENT_LABEL, ProjectEnvironment } from '@/types/enums';
import { ProjectCard } from '@/features/projects/components/ProjectCard';
import {
  ProjectFormDialog,
  type ProjectFormValues,
} from '@/features/projects/components/ProjectFormDialog';
import { ArchivedProjectsPanel } from '@/features/projects/components/ArchivedProjectsPanel';
import { useCreateProject, useProjects } from '@/features/projects/api';
import { useProjectStats } from '@/features/reports/api';
import { CenteredPageLayout } from '@/layouts/shared';

const CARD_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]';

/** Ties each environment's filter dot to the badge the card already shows. */
const ENV_DOT: Record<ProjectEnvironment, string> = {
  [ProjectEnvironment.DEVELOPMENT]: 'hsl(var(--muted-foreground))',
  [ProjectEnvironment.STAGING]: 'hsl(var(--warning))',
  [ProjectEnvironment.PRODUCTION]: 'hsl(var(--success))',
};

/**
 * The testing index: every project as a card, with the workspace's coverage
 * rolled up above them.
 *
 * Laid out as *narrow → summarise → browse*. The toolbar comes first because the
 * coverage band reads the filtered set, not the whole workspace — filter to
 * Production and the bar answers "where is production at". Band and cards take
 * their numbers from the same batch rollup, so they can't disagree.
 */
export function ProjectsPage() {
  const { canManageDelivery: isAdmin, canWrite } = useAuth();

  const { data, isLoading, isError, refetch } = useProjects({ limit: 100 });
  const create = useCreateProject();
  const projects = useMemo(() => data?.items ?? [], [data]);
  // Rollups for every project, not just the visible ones — narrowing the list is
  // then instant and never refetches.
  const { data: statsList } = useProjectStats(projects.map((p) => p.id));
  const statsById = useMemo(
    () => new Map((statsList ?? []).map((s) => [s.projectId, s])),
    [statsList],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterSelections>({});

  const filterCategories = [
    {
      id: 'environment',
      label: t('projects.environment'),
      options: Object.values(ProjectEnvironment).map((env) => ({
        id: env,
        label: ENVIRONMENT_LABEL[env],
        color: ENV_DOT[env],
      })),
    },
  ];

  // Filtered here rather than on the server: the page already holds every
  // project in one query, so a round-trip per keystroke would only be slower.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const envs = new Set(filters.environment ?? []);
    return projects.filter((p) => {
      if (envs.size > 0 && !envs.has(p.environment)) return false;
      if (!needle) return true;
      return [p.title, p.subtitle, p.owner].some((field) =>
        (field ?? '').toLowerCase().includes(needle),
      );
    });
  }, [projects, query, filters]);

  /** Anything cutting the list — what the counter and "Clear all" key off. */
  const narrowing = query.trim().length > 0 || countFilters(filters) > 0;

  // Same rollup rule as the card: live stats when they've arrived, the project's
  // own counters until then — so the band and the cards always agree.
  const coverage = useMemo(() => {
    const sum = { total: 0, done: 0, testing: 0, info: 0 };
    for (const p of visible) {
      const r = statsById.get(p.id) ?? p;
      sum.total += r.reportsTotal;
      sum.done += r.reportsDone;
      sum.testing += r.reportsTesting;
      sum.info += r.reportsInfo;
    }
    // Matches the API's own definition of a project's progress.
    return { ...sum, pct: sum.total > 0 ? Math.round((sum.done / sum.total) * 100) : 0 };
  }, [visible, statsById]);

  function clearFilters() {
    setQuery('');
    setFilters({});
  }

  function onCreate(values: ProjectFormValues) {
    setCreateError(null);
    create.mutate(values, {
      onSuccess: () => setCreateOpen(false),
      onError: (e) => setCreateError((e as Error).message),
    });
  }

  return (
    <CenteredPageLayout>
      <PageHeader
        title={t('nav.projects')}
        subtitle={t('projects.hint')}
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>+ {t('projects.new')}</Button>
          ) : undefined
        }
      />

      {/* Toolbar — only what narrows the list, and only once there's a list. One
          row even on a phone: search takes the slack, Filter hugs its label, and
          only the counter wraps. Stacking these would cost two screens' worth of
          chrome before the first card. */}
      {!isLoading && !isError && projects.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <Input
            className="min-w-0 flex-1 sm:max-w-[280px]"
            placeholder={t('projects.search')}
            aria-label={t('projects.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <FilterMenu
            size="default"
            className="shrink-0"
            categories={filterCategories}
            value={filters}
            onChange={setFilters}
          />
          {narrowing && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {visible.length} / {projects.length}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md px-1.5 py-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {t('filters.clearAll')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Coverage across whatever's on screen. Hidden until something has been
          written down — an all-zero bar tells a new workspace nothing. */}
      {coverage.total > 0 && (
        <section className="mb-5 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
          {/* Stacked, not strung across the row: on a wide screen a single-line
              band leaves the label and its badges a thousand pixels apart. */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('projects.coverage')}
            </h2>
            <span className="text-sm font-semibold tabular-nums">{coverage.pct}%</span>
          </div>
          <ProgressBar value={coverage.pct} className="mt-2.5" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="success">
              {coverage.done} {t('projects.done')}
            </Badge>
            <Badge variant="warning">
              {coverage.testing} {t('projects.testing')}
            </Badge>
            <Badge variant="muted">
              {coverage.info} {t('projects.info')}
            </Badge>
          </div>
        </section>
      )}

      {isLoading ? (
        <CardGridSkeleton />
      ) : isError ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('common.error')}{' '}
          <button
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => refetch()}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {canWrite ? t('projects.empty') : t('projects.emptyGuest')}
        </div>
      ) : visible.length === 0 ? (
        // A filter emptied the list, not the workspace — say so, and offer the way
        // back rather than leaving a dead end.
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('projects.noMatch')}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('filters.clearAll')}
          </button>
        </div>
      ) : (
        <div className={CARD_GRID}>
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              canWrite={canWrite}
              canArchive={isAdmin}
              stats={statsById.get(p.id)}
            />
          ))}
          {/* Create from the end of the grid, where the eye already is. Hidden
              while narrowing, so a filtered result stays only results — and on a
              phone, where the topbar's button is already in view and this would
              only be a screenful of dashed border. */}
          {canWrite && !narrowing && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="hidden min-h-[152px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            >
              <Plus className="size-5" aria-hidden />
              <span className="text-sm font-medium">{t('projects.new')}</span>
            </button>
          )}
        </div>
      )}

      {/* The archive: one quiet disclosure rather than a permanent heading over
          nothing. Admin-only, because only admins can restore or delete. */}
      {isAdmin && !isLoading && (
        <section className="mt-8">
          <button
            type="button"
            aria-expanded={showArchived}
            aria-label={showArchived ? t('projects.hideArchived') : t('projects.showArchived')}
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 rounded-md py-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', showArchived && 'rotate-90')}
              aria-hidden
            />
            {t('projects.archived')}
          </button>
          {showArchived && (
            <div className="mt-3">
              <ArchivedProjectsPanel />
            </div>
          )}
        </section>
      )}

      {createOpen && (
        <ProjectFormDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          submitting={create.isPending}
          error={createError}
          onSubmit={onCreate}
        />
      )}
    </CenteredPageLayout>
  );
}

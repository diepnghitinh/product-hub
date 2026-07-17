import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button, Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { PageHeader } from '@/components/PageHeader';
import { BackLink } from '@/components/BackLink';
import { KanbanBoard } from '@/components/KanbanBoard';
import {
  FilterMenu,
  UNASSIGNED,
  type FilterCategory,
  type FilterSelections,
} from '@/components/FilterMenu';
import { timeAgo } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import { useProjects } from '@/features/projects/api';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  BugStatus,
  DEFAULT_BUG_STATUSES,
} from '@/types/enums';
import type { BugDto } from '@/types/dto';
import { CreateBugDialog } from './components/CreateBugDialog';
import { useBugs, useSetBugStatus } from './api';
import { useBugStatuses } from '@/features/settings/api';

/** Severity → dot color (shadcn semantic tokens). */
const SEVERITY_DOT: Record<BugSeverity, string> = {
  [BugSeverity.LOW]: 'bg-muted-foreground',
  [BugSeverity.MEDIUM]: 'bg-info',
  [BugSeverity.HIGH]: 'bg-warning',
  [BugSeverity.CRITICAL]: 'bg-destructive',
};

/** Bug card visual — shared by the column list and the lifted drag overlay. */
function BugCard({ bug, overlay = false }: { bug: BugDto; overlay?: boolean }) {
  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-foreground/20',
        overlay ? 'w-[256px] rotate-3 cursor-grabbing shadow-2xl' : 'cursor-pointer',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEVERITY_DOT[bug.severity])}
          title={BUG_SEVERITY_LABEL[bug.severity]}
        />
        <span className="text-[13px] leading-snug">{bug.title}</span>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{bug.assigneeName || t('bugs.unassigned')}</span>
        <span>{timeAgo(bug.updatedAt)}</span>
      </div>
    </article>
  );
}

export function BugsBoardPage() {
  const { canEditDelivery: canWrite, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const projectId = params.get('projectId') || undefined;
  const projectName = params.get('project') || undefined;
  const caseId = params.get('caseId') || undefined;
  const caseName = params.get('case') || undefined;
  const reportId = params.get('reportId') || undefined;

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterSelections>({});
  const [createOpen, setCreateOpen] = useState(false);

  const setStatus = useSetBugStatus();
  const { data: statusConfig } = useBugStatuses();
  const columns = statusConfig?.length ? statusConfig : DEFAULT_BUG_STATUSES;

  // People + projects are only needed to label the filter options.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const { data: projectsData } = useProjects({ limit: 100 });

  const { data, isLoading } = useBugs({
    search: search || undefined,
    status: filters.status as BugStatus[] | undefined,
    severity: filters.severity as BugSeverity[] | undefined,
    assigneeId: filters.assigneeId,
    // A ?projectId= in the URL scopes the whole board; the filter narrows within it.
    projectId: projectId ? [projectId] : filters.projectId,
    caseId,
  });

  const filterCategories: FilterCategory[] = [
    {
      id: 'status',
      label: t('bugs.status'),
      options: columns.map((c) => ({ id: c.key, label: c.label, color: c.color })),
    },
    {
      id: 'severity',
      label: t('bugs.severity'),
      options: BUG_SEVERITIES.map((s) => ({
        id: s,
        label: BUG_SEVERITY_LABEL[s],
        color: BUG_SEVERITY_COLOR[s],
      })),
    },
    {
      id: 'assigneeId',
      label: t('filters.assignee'),
      searchable: true,
      options: [
        { id: UNASSIGNED, label: t('filters.unassigned') },
        ...(usersData?.items ?? []).map((u) => ({ id: u.id, label: u.name })),
      ],
    },
    // Already scoped by the URL — a project filter would be redundant.
    ...(projectId
      ? []
      : [
          {
            id: 'projectId',
            label: t('filters.project'),
            searchable: true,
            options: (projectsData?.items ?? []).map((p) => ({ id: p.id, label: p.title })),
          },
        ]),
  ];

  const bugs = data?.items ?? [];

  /** Bugs don't persist ordering, so the drop slot (`overId`) is ignored — only
   * the destination column matters. */
  function onMove(id: string, toStatus: string) {
    const bug = bugs.find((b) => b.id === id);
    if (bug && bug.status !== toStatus) setStatus.mutate({ id, status: toStatus as BugStatus });
  }

  return (
    <div className="flex flex-col sm:h-full">
      {projectId && (
        <BackLink to={`/testing/${projectId}`}>{projectName || t('nav.projects')}</BackLink>
      )}
      <PageHeader
        title={
          caseName
            ? `${t('bugs.forCase')} ${caseName}`
            : projectName
              ? `${t('bugs.title')} — ${projectName}`
              : t('bugs.title')
        }
      />

      <div className="mb-6 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          className="sm:max-w-[280px]"
          placeholder={t('bugs.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {/* `default` so it lines up with the h-9 search input + New bug button. */}
        <FilterMenu
          size="default"
          categories={filterCategories}
          value={filters}
          onChange={setFilters}
        />
        {canWrite && (
          <Button className="sm:ml-auto" onClick={() => setCreateOpen(true)}>
            + {t('bugs.new')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : bugs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('bugs.empty')}
        </div>
      ) : (
        <KanbanBoard
          columns={columns}
          items={bugs}
          getId={(b) => b.id}
          getColumnKey={(b) => b.status}
          renderCard={(bug, overlay) => <BugCard bug={bug} overlay={overlay} />}
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={(bug) => navigate(`/bugs/${bug.id}`)}
        />
      )}

      {createOpen && (
        <CreateBugDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          defaultProjectId={projectId}
          defaultCaseId={caseId}
          defaultCaseLabel={caseName}
          defaultReportId={reportId}
        />
      )}
    </div>
  );
}

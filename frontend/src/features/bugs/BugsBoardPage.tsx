import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { Icon } from '@/components/Icon';
import { BackLink } from '@/components/BackLink';
import { BoardCard, BoardCardAge, KanbanBoard, KanbanCardToolbar } from '@/components/KanbanBoard';
import { LabelChips } from '@/features/labels/LabelChips';
import {
  FilterMenu,
  UNASSIGNED,
  type FilterCategory,
  type FilterSelections,
} from '@/components/FilterMenu';
import { useUsers } from '@/features/users/api';
import { useProjects } from '@/features/projects/api';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  BugStatus,
  TeamIssueType,
} from '@/types/enums';
import type { TaskLabelConfig } from '@/types/enums';
import type { BugDto, TeamDto } from '@/types/dto';
import { CreateBugDialog } from './components/CreateBugDialog';
import { useBugs, useDeleteBug, useSetBugStatus } from './api';
import { useTeamStatuses, useTeamLabelsLookup } from '@/features/teams/api';
import { TeamShareMenu } from '@/features/teams/TeamShareMenu';

/** Severity → dot color (shadcn semantic tokens). */
const SEVERITY_DOT: Record<BugSeverity, string> = {
  [BugSeverity.LOW]: 'bg-muted-foreground',
  [BugSeverity.MEDIUM]: 'bg-info',
  [BugSeverity.HIGH]: 'bg-warning',
  [BugSeverity.CRITICAL]: 'bg-destructive',
};

/** Bug card — follows the shared `BoardCard` standard (see the roadmap item).
 * `labels` is the owning team's label set; the card resolves the bug's own
 * `labelKeys` against it (see `LabelChips`). */
export function BugCard({
  bug,
  labels,
  overlay = false,
}: {
  bug: BugDto;
  labels?: TaskLabelConfig[];
  overlay?: boolean;
}) {
  return (
    <BoardCard
      overlay={overlay}
      titleDotColor={BUG_SEVERITY_COLOR[bug.severity]}
      titleDotLabel={BUG_SEVERITY_LABEL[bug.severity]}
      title={bug.title}
      titleTrailing={
        bug.shortId ? (
          <Badge variant="secondary" className="font-mono">
            {bug.shortId}
          </Badge>
        ) : undefined
      }
      labels={<LabelChips keys={bug.labelKeys} labels={labels} />}
      metaLeading={
        <Badge variant="muted" className="max-w-full truncate">
          {bug.assigneeName || t('bugs.unassigned')}
        </Badge>
      }
      metaTrailing={<BoardCardAge createdAt={bug.createdAt} />}
    />
  );
}

interface BugsBoardPageProps {
  /** Scope the board to a team's issue list (the /teams/:id route). */
  teamId?: string;
  /** Team name for the header, when rendered inside a team. */
  teamName?: string;
  /** The team's symbol, rendered beside the heading. */
  titleIcon?: ReactNode;
  /** The team, when rendered inside a team board — enables the ⋯ → Share menu. */
  shareTeam?: TeamDto;
}

export function BugsBoardPage({ teamId, teamName, titleIcon, shareTeam }: BugsBoardPageProps = {}) {
  const { canEditDelivery: canWrite, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId') || undefined;
  const projectName = params.get('project') || undefined;
  const caseId = params.get('caseId') || undefined;
  const caseName = params.get('case') || undefined;
  const reportId = params.get('reportId') || undefined;

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterSelections>({});
  // Board is default and kept out of the URL; ?view=list is shareable.
  const view: 'board' | 'list' = params.get('view') === 'list' ? 'list' : 'board';
  const setView = (v: 'board' | 'list') => {
    const next = new URLSearchParams(params);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setParams(next, { replace: true });
  };
  const [createOpen, setCreateOpen] = useState(false);
  // The column '+ Add' was clicked in — the new bug opens there.
  const [createStatus, setCreateStatus] = useState<string | undefined>();

  const setStatus = useSetBugStatus();
  const remove = useDeleteBug();
  // Columns belong to the team that owns this board (default bug team when standalone).
  const columns = useTeamStatuses(teamId, TeamIssueType.BUG);
  // Labels resolve per-bug (a standalone board's bugs all sit in the default team,
  // but each still carries its own teamId — so resolve against that, not the board's).
  const labelsFor = useTeamLabelsLookup();

  // People + projects are only needed to label the filter options.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const { data: projectsData } = useProjects({ limit: 100 });

  const { data, isLoading } = useBugs({
    teamId,
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
    <IssueBoardLayout
      // Bugs hang off the dynamic Teams list, so the shell's nav model has no
      // icon for this route — supply one, or the crumb reads bare next to every
      // other page's.
      titleIcon={titleIcon ?? <Icon name="bug" size={16} className="shrink-0 text-muted-foreground" />}
      backLink={
        projectId ? (
          <BackLink to={`/testing/${projectId}`}>{projectName || t('nav.projects')}</BackLink>
        ) : undefined
      }
      title={
        teamName ??
        (caseName
          ? `${t('bugs.forCase')} ${caseName}`
          : projectName
            ? `${t('bugs.title')} — ${projectName}`
            : t('bugs.title'))
      }
      subtitle={teamName ? t('teams.issuesSubtitle') : undefined}
      search={{ value: search, onChange: setSearch, placeholder: t('bugs.search') }}
      filters={
        <FilterMenu size="default" categories={filterCategories} value={filters} onChange={setFilters} />
      }
      view={{
        value: view,
        onChange: (v) => setView(v as 'board' | 'list'),
        options: [
          { value: 'board', label: t('tasks.viewBoard'), icon: <LayoutGrid /> },
          { value: 'list', label: t('tasks.viewList'), icon: <List /> },
        ],
      }}
      actions={
        canWrite || (shareTeam && canManageDelivery) ? (
          <div className="flex items-center gap-2">
            {canWrite && <Button onClick={() => setCreateOpen(true)}>+ {t('bugs.new')}</Button>}
            {shareTeam && <TeamShareMenu team={shareTeam} />}
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className={cn('grid place-items-center rounded-xl border border-dashed p-8', BOARD_GUTTER)}>
          <Spinner />
        </div>
      ) : bugs.length === 0 ? (
        <div className={cn('mx-4 rounded-xl border border-dashed p-8 text-center text-muted-foreground md:mx-8')}>
          {t('bugs.empty')}
        </div>
      ) : view === 'board' ? (
        <KanbanBoard
          columns={columns}
          items={bugs}
          getId={(b) => b.id}
          getColumnKey={(b) => b.status}
          renderCard={(bug, overlay) => (
            <BugCard bug={bug} labels={labelsFor(bug.teamId)} overlay={overlay} />
          )}
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={(bug) => navigate(`/bugs/${bug.shortId || bug.id}`)}
          // The add + card-toolbar affordances, same as every board.
          renderCardToolbar={
            canWrite
              ? (bug) => (
                  <KanbanCardToolbar
                    editLabel={t('common.edit')}
                    removeLabel={t('common.delete')}
                    onEdit={() => navigate(`/bugs/${bug.shortId || bug.id}`)}
                    onRemove={() => {
                      if (confirm(t('bugs.confirmDelete'))) remove.mutate(bug.id);
                    }}
                  />
                )
              : undefined
          }
          onColumnAdd={
            canWrite
              ? (col) => {
                  setCreateStatus(col.key);
                  setCreateOpen(true);
                }
              : undefined
          }
          addLabel={t('bugs.addToColumn')}
        />
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6', BOARD_GUTTER)}>
          <BugList
            bugs={bugs}
            columns={columns}
            labelsFor={labelsFor}
            onOpen={(b) => navigate(`/bugs/${b.shortId || b.id}`)}
          />
        </div>
      )}

      {createOpen && (
        <CreateBugDialog
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            setCreateStatus(undefined);
          }}
          defaultStatus={createStatus}
          teamId={teamId}
          defaultProjectId={projectId}
          defaultCaseId={caseId}
          defaultCaseLabel={caseName}
          defaultReportId={reportId}
        />
      )}
    </IssueBoardLayout>
  );
}

/** List view — grouped by status column, mirroring the tasks list so both
 * teams' list views read identically. */
function BugList({
  bugs,
  columns,
  labelsFor,
  onOpen,
}: {
  bugs: BugDto[];
  columns: { key: string; label: string; color: string }[];
  labelsFor: (teamId: string | undefined) => TaskLabelConfig[];
  onOpen: (bug: BugDto) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {columns.map((col) => {
        const list = bugs.filter((b) => b.status === col.key);
        if (list.length === 0) return null;
        return (
          <section key={col.key}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: col.color }}
                aria-hidden
              />
              <h2 className="text-sm font-medium text-foreground">{col.label}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
            </div>
            <div className="rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
              {list.map((bug) => (
                <button
                  key={bug.id}
                  type="button"
                  onClick={() => onOpen(bug)}
                  className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-foreground transition-colors hover:bg-accent [&:not(:last-child)]:border-b"
                >
                  <span
                    className={cn('size-2 shrink-0 rounded-full', SEVERITY_DOT[bug.severity])}
                    title={BUG_SEVERITY_LABEL[bug.severity]}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{bug.title}</span>
                  <LabelChips
                    keys={bug.labelKeys}
                    labels={labelsFor(bug.teamId)}
                    max={3}
                    className="hidden shrink-0 sm:flex"
                  />
                  {bug.shortId && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {bug.shortId}
                    </span>
                  )}
                  <Badge variant="muted" className="max-w-[35%] shrink-0 truncate">
                    {bug.assigneeName || t('bugs.unassigned')}
                  </Badge>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

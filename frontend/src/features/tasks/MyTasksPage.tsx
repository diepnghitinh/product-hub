import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List } from 'lucide-react';
import { Badge, Button, Spinner } from '@/components/ui';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import {
  KanbanBoard,
  KanbanCard,
  KanbanCardToolbar,
} from '@/components/KanbanBoard';
import {
  FilterMenu,
  UNASSIGNED,
  type FilterCategory,
  type FilterSelections,
} from '@/components/FilterMenu';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import { useProjects } from '@/features/projects/api';
import { useRoadmaps } from '@/features/roadmaps/api';
import { useTeamStatuses } from '@/features/teams/api';
import { TeamShareMenu } from '@/features/teams/TeamShareMenu';
import { TaskStatus, TeamIssueType, type TeamStatusConfig } from '@/types/enums';
import type { TaskDto, TeamDto } from '@/types/dto';
import { useDeleteTask, useSetTaskStatus, useTasks } from './api';

/** The engineer's personal queue — every task assigned to them, as a kanban
 * (drag to change status) or a status-grouped list. Tasks can be created
 * straight from here (auto-assigned to the current user). */
interface MyTasksPageProps {
  /** Scope the board to a team's issue list (the /teams/:id route). */
  teamId?: string;
  /** Team name for the header, when rendered inside a team. */
  teamName?: string;
  /** The team's symbol, rendered beside the heading. */
  titleIcon?: ReactNode;
  /** The team, when rendered inside a team board — enables the ⋯ → Share menu. */
  shareTeam?: TeamDto;
}

export function MyTasksPage({ teamId, teamName, titleIcon, shareTeam }: MyTasksPageProps = {}) {
  const { user, canEditDelivery: canWrite, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  // Columns belong to the team that owns this board (default task team when standalone).
  const columns = useTeamStatuses(teamId, TeamIssueType.TASK);

  // Creating opens the full New task page — carrying the board's team, and the
  // column when added from one, so the draft opens pre-set exactly there.
  const newTaskHref = (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (teamId) params.set('teamId', teamId);
    const qs = params.toString();
    return `/tasks/new${qs ? `?${qs}` : ''}`;
  };

  // Board is the default and kept out of the query for clean URLs; ?view=list
  // survives reloads and is shareable (same pattern as the roadmap board).
  const [searchParams, setSearchParams] = useSearchParams();
  const view: 'board' | 'list' = searchParams.get('view') === 'list' ? 'list' : 'board';
  const setView = (v: 'board' | 'list') => {
    const next = new URLSearchParams(searchParams);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  const [filters, setFilters] = useState<FilterSelections>({});
  const [search, setSearch] = useState('');

  // Assigned to me OR created by me — so a task I create always lands here, even
  // if it wasn't assigned. Sentinel keeps it empty if the user isn't loaded yet.
  const { data, isLoading } = useTasks({
    teamId,
    search: search || undefined,
    // Inside a team the list is the team's issues; standalone it's *my* queue.
    mine: teamId ? undefined : user?.id ?? '__none__',
    status: filters.status as TaskStatus[] | undefined,
    assigneeId: filters.assigneeId,
    roadmapItemId: filters.roadmapItemId,
    projectId: filters.projectId,
  });
  const tasks = data?.items ?? [];
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  // Only needed to label the filter options.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const { data: projectsData } = useProjects({ limit: 100 });
  const { data: roadmaps } = useRoadmaps();

  const filterCategories: FilterCategory[] = [
    {
      id: 'status',
      label: t('roadmaps.status'),
      options: columns.map((c) => ({ id: c.key, label: c.label, color: c.color })),
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
    {
      id: 'roadmapItemId',
      label: t('filters.backlogItem'),
      searchable: true,
      // Flattened across roadmaps and prefixed, so same-named items stay distinct.
      options: (roadmaps ?? []).flatMap((r) =>
        (r.items ?? []).map((i) => ({ id: i.id, label: `${r.title} · ${i.title}` })),
      ),
    },
    {
      id: 'projectId',
      label: t('filters.project'),
      searchable: true,
      options: (projectsData?.items ?? []).map((p) => ({ id: p.id, label: p.title })),
    },
  ];

  /** Tasks don't persist ordering, so the drop slot is ignored — only the
   * destination column matters. */
  function onMove(id: string, toStatus: string) {
    const task = tasks.find((tk) => tk.id === id);
    if (task && task.status !== toStatus) setStatus.mutate({ id, status: toStatus as TaskStatus });
  }

  return (
    <IssueBoardLayout
      // Team boards (titleIcon passed in) aren't in the nav model, so they bring
      // their own icon. Standalone "Assigned to me" IS in the nav model — the
      // topbar's section icon already covers it, so adding one here would double up.
      titleIcon={titleIcon}
      title={teamName ?? t('tasks.assignedToMe')}
      subtitle={teamName ? t('teams.issuesSubtitle') : t('tasks.mySubtitle')}
      search={{ value: search, onChange: setSearch, placeholder: t('tasks.search') }}
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
            {canWrite && (
              <Button onClick={() => navigate(newTaskHref())}>+ {t('tasks.new')}</Button>
            )}
            {shareTeam && <TeamShareMenu team={shareTeam} />}
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className={cn('grid place-items-center rounded-xl border border-dashed p-8', BOARD_GUTTER)}>
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center md:mx-8">
          <p className="text-muted-foreground">{t('tasks.none')}</p>
          {canWrite && (
            <Button size="sm" className="mt-3" onClick={() => navigate(newTaskHref())}>
              {t('tasks.new')}
            </Button>
          )}
        </div>
      ) : view === 'board' ? (
        <KanbanBoard
          columns={columns}
          items={tasks}
          getId={(tk) => tk.id}
          getColumnKey={(tk) => tk.status}
          renderCard={(task, overlay) => <TaskCard task={task} overlay={overlay} />}
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={(task) => navigate(`/tasks/${task.shortId || task.id}`)}
          // The add + card-toolbar affordances, same as every board.
          renderCardToolbar={
            canWrite
              ? (task) => (
                  <KanbanCardToolbar
                    editLabel={t('common.edit')}
                    removeLabel={t('common.delete')}
                    onEdit={() => navigate(`/tasks/${task.shortId || task.id}`)}
                    onRemove={() => {
                      if (confirm(t('tasks.confirmDelete'))) remove.mutate(task.id);
                    }}
                  />
                )
              : undefined
          }
          onColumnAdd={canWrite ? (col) => navigate(newTaskHref(col.key)) : undefined}
          addLabel={t('tasks.addToColumn')}
        />
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6', BOARD_GUTTER)}>
          <TaskList tasks={tasks} columns={columns} />
        </div>
      )}
    </IssueBoardLayout>
  );
}

/** Task card visual — shared by the column list and the lifted drag overlay. */
export function TaskCard({ task, overlay = false }: { task: TaskDto; overlay?: boolean }) {
  return (
    <KanbanCard overlay={overlay}>
      <span
        className={cn(
          'text-[13px] leading-snug',
          task.status === TaskStatus.DONE && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </span>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        {task.roadmapItemLabel ? (
          <Badge variant="muted" className="min-w-0 truncate" title={task.roadmapItemLabel}>
            {task.roadmapItemLabel}
          </Badge>
        ) : (
          <span>{t('tasks.noBacklogItem')}</span>
        )}
      </div>
    </KanbanCard>
  );
}

/** The original queue view: grouped by status column, each row linking to its
 * backlog item's roadmap. */
function TaskList({ tasks, columns }: { tasks: TaskDto[]; columns: TeamStatusConfig[] }) {
  return (
    <div className="flex flex-col gap-6">
      {columns.map((col) => {
        const list = tasks.filter((tk) => tk.status === col.key);
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
              {list.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Trailing metadata mirrors the bug list rows (id, then assignee) so both
 * teams' lists read as siblings. */
function TaskRow({ task }: { task: TaskDto }) {
  return (
    <Link
      to={`/tasks/${task.shortId || task.id}`}
      className="flex items-center gap-3 rounded-md px-4 py-3 text-foreground transition-colors hover:bg-accent [&:not(:last-child)]:border-b"
    >
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          task.status === TaskStatus.DONE && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </span>
      {task.roadmapItemLabel && (
        <Badge variant="muted" className="max-w-[30%] shrink-0 truncate" title={task.roadmapItemLabel}>
          {task.roadmapItemLabel}
        </Badge>
      )}
      {task.shortId && (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{task.shortId}</span>
      )}
      <Badge variant="muted" className="max-w-[35%] shrink-0 truncate">
        {task.assigneeName || t('tasks.unassigned')}
      </Badge>
    </Link>
  );
}

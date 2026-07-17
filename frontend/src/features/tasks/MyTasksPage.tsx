import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { KanbanBoard } from '@/components/KanbanBoard';
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
import {  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  TaskStatus,
} from '@/types/enums';
import type { TaskDto } from '@/types/dto';
import { useSetTaskStatus, useTasks } from './api';
import { CreateTaskDialog } from './components/CreateTaskDialog';

// The board's columns are the task workflow itself — reuses the existing status
// label + colour maps, so no new colours enter the system.
const COLUMNS = TASK_STATUSES.map((s) => ({
  key: s,
  label: TASK_STATUS_LABEL[s],
  color: TASK_STATUS_COLOR[s],
}));

/** The engineer's personal queue — every task assigned to them, as a kanban
 * (drag to change status) or a status-grouped list. Tasks can be created
 * straight from here (auto-assigned to the current user). */
export function MyTasksPage() {
  const { user, canEditDelivery: canWrite, canManageDelivery } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

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

  // Assigned to me OR created by me — so a task I create always lands here, even
  // if it wasn't assigned. Sentinel keeps it empty if the user isn't loaded yet.
  const { data, isLoading } = useTasks({
    mine: user?.id ?? '__none__',
    status: filters.status as TaskStatus[] | undefined,
    assigneeId: filters.assigneeId,
    roadmapItemId: filters.roadmapItemId,
    projectId: filters.projectId,
  });
  const tasks = data?.items ?? [];
  const setStatus = useSetTaskStatus();

  // Only needed to label the filter options.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const { data: projectsData } = useProjects({ limit: 100 });
  const { data: roadmaps } = useRoadmaps();

  const filterCategories: FilterCategory[] = [
    {
      id: 'status',
      label: t('roadmaps.status'),
      options: COLUMNS.map((c) => ({ id: c.key, label: c.label, color: c.color })),
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
    <div className="flex flex-col sm:h-full">
      <PageHeader
        title={t('tasks.myTasks')}
        subtitle={t('tasks.mySubtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterMenu categories={filterCategories} value={filters} onChange={setFilters} />
            <div className="inline-flex rounded-md border p-0.5">
              {(['board', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={cn(
                    'rounded px-3 py-1 text-sm transition-colors',
                    view === v
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setView(v)}
                >
                  {v === 'board' ? t('tasks.viewBoard') : t('tasks.viewList')}
                </button>
              ))}
            </div>
            {canWrite && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                {t('tasks.new')}
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t('tasks.none')}</p>
          {canWrite && (
            <Button size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
              {t('tasks.new')}
            </Button>
          )}
        </div>
      ) : view === 'board' ? (
        <KanbanBoard
          columns={COLUMNS}
          items={tasks}
          getId={(tk) => tk.id}
          getColumnKey={(tk) => tk.status}
          renderCard={(task, overlay) => <TaskCard task={task} overlay={overlay} />}
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={(task) => navigate(`/tasks/${task.id}`)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <TaskList tasks={tasks} />
        </div>
      )}

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

/** Task card visual — shared by the column list and the lifted drag overlay. */
function TaskCard({ task, overlay = false }: { task: TaskDto; overlay?: boolean }) {
  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-foreground/20',
        overlay && 'w-[256px] rotate-3 cursor-grabbing shadow-2xl',
      )}
    >
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
    </article>
  );
}

/** The original queue view: grouped by status, each row linking to its backlog
 * item's roadmap. */
function TaskList({ tasks }: { tasks: TaskDto[] }) {
  return (
    <div className="flex flex-col gap-6">
      {TASK_STATUSES.map((status) => {
        const list = tasks.filter((tk) => tk.status === status);
        if (list.length === 0) return null;
        return (
          <section key={status}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: TASK_STATUS_COLOR[status] }}
                aria-hidden
              />
              <h2 className="text-sm font-medium text-foreground">{TASK_STATUS_LABEL[status]}</h2>
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

function TaskRow({ task }: { task: TaskDto }) {
  const rowClass =
    'flex items-center gap-3 rounded-md px-4 py-3 text-foreground transition-colors hover:bg-accent [&:not(:last-child)]:border-b';
  const inner = (
    <>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          task.status === TaskStatus.DONE && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </span>
      {task.roadmapItemLabel && (
        <Badge variant="muted" className="max-w-[45%] shrink-0 truncate" title={task.roadmapItemLabel}>
          {task.roadmapItemLabel}
        </Badge>
      )}
    </>
  );

  return (
    <Link to={`/tasks/${task.id}`} className={rowClass}>
      {inner}
    </Link>
  );
}

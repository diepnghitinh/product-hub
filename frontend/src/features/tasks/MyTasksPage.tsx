import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import {  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  TaskStatus,
} from '@/types/enums';
import type { TaskDto } from '@/types/dto';
import { useTasks } from './api';
import { CreateTaskDialog } from './components/CreateTaskDialog';

/** The engineer's personal queue — every task assigned to them, grouped by
 * status, each linking back to its backlog item's roadmap. Tasks can be created
 * straight from here (auto-assigned to the current user). */
export function MyTasksPage() {
  const { user, canEditDelivery: canWrite } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  // Assigned to me OR created by me — so a task I create always lands here, even
  // if it wasn't assigned. Sentinel keeps it empty if the user isn't loaded yet.
  const { data, isLoading } = useTasks({ mine: user?.id ?? '__none__' });
  const tasks = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title={t('tasks.myTasks')}
        subtitle={t('tasks.mySubtitle')}
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              {t('tasks.new')}
            </Button>
          ) : undefined
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
      ) : (
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
                  <h2 className="text-sm font-medium text-foreground">
                    {TASK_STATUS_LABEL[status]}
                  </h2>
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
      )}

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
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

  return task.roadmapId ? (
    <Link to={`/roadmaps/${task.roadmapId}`} className={rowClass} title={t('tasks.openRoadmaps')}>
      {inner}
    </Link>
  ) : (
    <div className={rowClass}>{inner}</div>
  );
}

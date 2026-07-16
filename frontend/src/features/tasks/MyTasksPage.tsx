import { Link } from 'react-router-dom';
import { Badge, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import {
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  TaskStatus,
} from '@/types/enums';
import type { TaskDto } from '@/types/dto';
import { useTasks } from './api';

/** The engineer's personal queue — every task assigned to them, grouped by
 * status, each linking back to its backlog item's roadmap. */
export function MyTasksPage() {
  const { user } = useAuth();
  // Sentinel keeps the list empty (never "all tenant tasks") if the user isn't loaded.
  const { data, isLoading } = useTasks({ assigneeId: user?.id ?? '__none__' });
  const tasks = data?.items ?? [];

  return (
    <div>
      <PageHeader title={t('tasks.myTasks')} subtitle={t('tasks.mySubtitle')} />

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('tasks.none')}{' '}
          <Link
            to="/roadmaps"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('tasks.openRoadmaps')}
          </Link>
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

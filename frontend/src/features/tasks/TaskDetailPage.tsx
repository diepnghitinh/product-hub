import { Link, useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import {
  Button,
  Combobox,
  DotLabel,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
import { timeAgo } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import {
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  TaskStatus,
} from '@/types/enums';
import { useDeleteTask, useSetTaskStatus, useTask, useUpdateTask } from './api';

const ROW_LABEL = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

/** One task's detail — the engineer's working view of a single piece of work.
 * Mirrors the bug detail layout (content + sticky meta sidebar). */
export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();
  useEscapeBack();

  const { data: task, isLoading } = useTask(taskId);
  const update = useUpdateTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  // /users is admin/product-only; testers & devs can still self-assign below.
  const { data: usersData } = useUsers({ limit: 100 }, isAdmin);
  const users = usersData?.items ?? [];

  const save = (input: Parameters<typeof update.mutate>[0]['input']) =>
    task && update.mutate({ id: task.id, input });

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }
  if (!task) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('tasks.notFound')}{' '}
        <Link
          to="/tasks"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('tasks.myTasks')}
        </Link>
      </div>
    );
  }

  const mine = !!user && task.assigneeId === user.id;

  return (
    <div>
      <BackLink to="/tasks">{t('tasks.myTasks')}</BackLink>

      <div className="grid items-start gap-6 md:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {canWrite ? (
            <Input
              className="h-auto border-transparent bg-transparent px-1.5 py-1 text-xl font-semibold shadow-none hover:border-input"
              defaultValue={task.title}
              aria-label={t('tasks.titleLabel')}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== task.title &&
                save({ title: e.target.value.trim() })
              }
            />
          ) : (
            <h1 className="text-xl font-semibold tracking-tight">{task.title}</h1>
          )}

          <Field label={t('tasks.descriptionLabel')}>
            {canWrite ? (
              <Textarea
                defaultValue={task.description}
                placeholder={t('tasks.descriptionLabel')}
                onBlur={(e) =>
                  e.target.value !== task.description && save({ description: e.target.value })
                }
              />
            ) : (
              <p className="text-muted-foreground">{task.description || '—'}</p>
            )}
          </Field>
        </div>

        <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm md:sticky md:top-6">
          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('roadmaps.status')}</span>
            {canWrite ? (
              <Select
                value={task.status}
                onValueChange={(v) => setStatus.mutate({ id: task.id, status: v as TaskStatus })}
                options={TASK_STATUSES.map((s) => ({
                  value: s,
                  label: <DotLabel color={TASK_STATUS_COLOR[s]}>{TASK_STATUS_LABEL[s]}</DotLabel>,
                }))}
              />
            ) : (
              <DotLabel color={TASK_STATUS_COLOR[task.status]}>
                {TASK_STATUS_LABEL[task.status]}
              </DotLabel>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('tasks.assign')}</span>
            {isAdmin ? (
              <Combobox
                value={task.assigneeId || ''}
                onChange={(v) => save({ assigneeId: v })}
                placeholder={t('tasks.assign')}
                options={[
                  { value: '', label: t('tasks.unassigned') },
                  ...users.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            ) : canWrite ? (
              <Button
                type="button"
                variant={mine ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => save({ assigneeId: mine ? '' : user?.id ?? '' })}
              >
                {mine ? t('tasks.assignedYou') : t('tasks.assignMe')}
              </Button>
            ) : (
              <span className="text-sm">{task.assigneeName || t('tasks.unassigned')}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('tasks.backlogItem')}</span>
            {task.roadmapId ? (
              <Link
                to={`/roadmaps/${task.roadmapId}`}
                className="text-sm font-medium underline-offset-4 hover:underline"
                title={t('tasks.openRoadmaps')}
              >
                {task.roadmapItemLabel || t('tasks.openRoadmaps')}
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">{t('tasks.noBacklogItem')}</span>
            )}
          </div>

          <div className="flex flex-col gap-1 border-t pt-3">
            <span className={ROW_LABEL}>{t('tasks.createdBy')}</span>
            <span className="text-sm">
              {task.createdByName || '—'} · {timeAgo(task.createdAt)}
            </span>
          </div>

          {canWrite && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (confirm(t('tasks.confirmDelete')))
                  remove.mutate(task.id, { onSuccess: () => navigate('/tasks') });
              }}
            >
              <Trash2 className="size-3.5" />
              {t('common.delete')}
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, CircleDot, Clock, Link2, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import {
  Button,
  Combobox,
  DotLabel,
  Input,
  MentionTextarea,
  RichTextEditor,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import type { CommentDto } from '@/types/dto';
import { useUsers } from '@/features/users/api';
import {
  useCreateTaskComment,
  useDeleteTaskComment,
  useTaskComments,
  useUpdateTaskComment,
} from '@/features/activity/api';
import { useTeamStatuses } from '@/features/teams/api';
import { TaskStatus, TeamIssueType } from '@/types/enums';
import { useDeleteTask, useSetTaskStatus, useTask, useUpdateTask } from './api';

/** Small initial-in-a-circle avatar used across the activity timeline. */
function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground',
        className,
      )}
      aria-hidden
    >
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

const PROP_LABEL = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

/** One task's detail — laid out like the Linear issue view: a wide content
 * column (title · description · activity) beside a Properties sidebar. */
export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();
  useEscapeBack();

  const { data: task, isLoading } = useTask(taskId);
  const update = useUpdateTask();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  // People list — readable by any member now, so @-mentions work for everyone.
  const { data: usersData } = useUsers({ limit: 100 });
  const users = usersData?.items ?? [];

  const { data: comments } = useTaskComments(task?.id);
  const createComment = useCreateTaskComment(task?.id ?? '');
  const [commentBody, setCommentBody] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);

  // Columns come from the team that owns this task.
  const columns = useTeamStatuses(task?.teamId, TeamIssueType.TASK);
  const statusCol = columns.find((c) => c.key === task?.status);

  const save = (input: Parameters<typeof update.mutate>[0]['input']) =>
    task && update.mutate({ id: task.id, input });

  // The rich editor emits HTML on every keystroke — debounce so we PATCH once
  // the user pauses, not per character.
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (descTimer.current && clearTimeout(descTimer.current)), []);
  function saveDescription(html: string) {
    if (!task || html === task.description) return;
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => save({ description: html }), 700);
  }

  function postComment() {
    const body = commentBody.trim();
    if (!body || !task) return;
    createComment.mutate(
      { body, mentions: mentionIds },
      {
        onSuccess: () => {
          setCommentBody('');
          setMentionIds([]);
        },
      },
    );
  }

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

  const thread = comments ?? [];

  return (
    <div>
      {/* Breadcrumb (My Tasks › TSK-7) */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/tasks" className="transition-colors hover:text-foreground">
          {t('tasks.myTasks')}
        </Link>
        {task.shortId && (
          <>
            <ChevronRight className="size-3.5 opacity-60" aria-hidden />
            <span className="font-mono text-foreground">{task.shortId}</span>
          </>
        )}
      </nav>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          {canWrite ? (
            <input
              className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
              defaultValue={task.title}
              placeholder={t('tasks.titleLabel')}
              aria-label={t('tasks.titleLabel')}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== task.title &&
                save({ title: e.target.value.trim() })
              }
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
          )}

          <div className="mt-4">
            {canWrite ? (
              <RichTextEditor
                value={task.description}
                onChange={saveDescription}
                placeholder={t('tasks.addDescription')}
                minHeight={80}
                images
              />
            ) : task.description ? (
              <div
                className="text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md"
                dangerouslySetInnerHTML={{ __html: task.description }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('tasks.addDescription')}</p>
            )}
          </div>

          {/* ── Activity ──────────────────────────────────────────────── */}
          <section className="mt-10 border-t pt-6">
            <h2 className="mb-5 text-base font-semibold">{t('activity.title')}</h2>

            <div className="flex flex-col gap-5">
              {/* System event — the task's creation opens the timeline. */}
              <div className="flex items-center gap-3 text-sm">
                <Avatar name={task.createdByName} />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {task.createdByName || t('tasks.someone')}
                  </span>{' '}
                  {t('tasks.createdThis')} · {timeAgo(task.createdAt)}
                </span>
              </div>

              {thread.map((c) => (
                <TaskCommentItem
                  key={c.id}
                  comment={c}
                  taskId={task.id}
                  canEdit={canWrite && (c.authorId === user?.id || isAdmin)}
                />
              ))}
            </div>

            {canWrite && (
              <div className="mt-5 rounded-lg border bg-card p-2 shadow-sm focus-within:border-primary">
                <MentionTextarea
                  value={commentBody}
                  onChange={setCommentBody}
                  onMentionsChange={setMentionIds}
                  options={users.map((u) => ({ id: u.id, name: u.name }))}
                  placeholder={t('activity.placeholder')}
                  aria-label={t('activity.placeholder')}
                  className="min-h-[60px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <div className="flex items-center justify-between px-1 pb-0.5">
                  <span className="text-xs text-muted-foreground">{t('activity.mentionHint')}</span>
                  <Button
                    size="sm"
                    onClick={postComment}
                    disabled={!commentBody.trim()}
                    loading={createComment.isPending}
                  >
                    {t('activity.comment')}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Properties sidebar ──────────────────────────────────────── */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-6">
          <span className={PROP_LABEL}>{t('tasks.properties')}</span>

          <div className="flex flex-col gap-3">
            <PropRow icon={<CircleDot className="size-4" style={{ color: statusCol?.color }} />}>
              {canWrite ? (
                <Select
                  value={task.status}
                  onValueChange={(v) => setStatus.mutate({ id: task.id, status: v })}
                  options={columns.map((c) => ({
                    value: c.key,
                    label: <DotLabel color={c.color}>{c.label}</DotLabel>,
                  }))}
                  className="h-8 border-0 bg-transparent px-0 shadow-none hover:bg-accent"
                />
              ) : (
                <DotLabel color={statusCol?.color ?? 'hsl(var(--muted-foreground))'}>
                  {statusCol?.label ?? task.status}
                </DotLabel>
              )}
            </PropRow>

            <PropRow icon={<Avatar name={task.assigneeName || '?'} className="size-4 text-[8px]" />}>
              {isAdmin ? (
                <Combobox
                  value={task.assigneeId || ''}
                  onChange={(v) => save({ assigneeId: v })}
                  placeholder={t('tasks.unassigned')}
                  className="h-8 border-0 bg-transparent px-0 shadow-none hover:bg-accent"
                  options={[
                    { value: '', label: t('tasks.unassigned') },
                    ...users.map((u) => ({ value: u.id, label: u.name })),
                  ]}
                />
              ) : canWrite ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start px-2"
                  onClick={() =>
                    save({ assigneeId: task.assigneeId === user?.id ? '' : user?.id ?? '' })
                  }
                >
                  {task.assigneeId === user?.id ? t('tasks.assignedYou') : t('tasks.assignMe')}
                </Button>
              ) : (
                <span className="text-sm">{task.assigneeName || t('tasks.unassigned')}</span>
              )}
            </PropRow>

            <PropRow icon={<Link2 className="size-4 text-muted-foreground" />}>
              {task.roadmapId ? (
                <Link
                  to={`/roadmaps/${task.roadmapId}`}
                  className="truncate text-sm font-medium underline-offset-4 hover:underline"
                  title={task.roadmapItemLabel || t('tasks.openRoadmaps')}
                >
                  {task.roadmapItemLabel || t('tasks.openRoadmaps')}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">{t('tasks.noBacklogItem')}</span>
              )}
            </PropRow>

            <PropRow icon={<Clock className="size-4 text-muted-foreground" />}>
              <span className="text-sm text-muted-foreground">
                {task.createdByName || '—'} · {timeAgo(task.createdAt)}
              </span>
            </PropRow>
          </div>

          {canWrite && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
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

/** A Properties row: a leading icon column + the value/control. */
function PropRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2.5">
      <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** One comment in a task's activity thread — avatar + inline edit/delete. */
function TaskCommentItem({
  comment,
  taskId,
  canEdit,
}: {
  comment: CommentDto;
  taskId: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const update = useUpdateTaskComment(taskId);
  const remove = useDeleteTaskComment(taskId);
  const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt;

  function saveEdit() {
    const body = draft.trim();
    if (!body || body === comment.body) {
      setEditing(false);
      return;
    }
    update.mutate({ id: comment.id, input: { body } }, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="group flex gap-3">
      <Avatar name={comment.authorName} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2 text-sm">
          <span className="font-medium">{comment.authorName}</span>
          <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
          {edited && <span className="text-xs text-muted-foreground">· {t('activity.edited')}</span>}
          {canEdit && !editing && (
            <span className="ml-auto flex gap-2.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => confirm(t('activity.confirmDelete')) && remove.mutate(comment.id)}
              >
                {t('common.delete')}
              </button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={saveEdit} loading={update.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
        )}
      </div>
    </div>
  );
}

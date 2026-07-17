import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import {
  Button,
  Combobox,
  DotLabel,
  Field,
  Input,
  MultiSelect,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
import { timeAgo } from '@/lib/format';
import { useEscapeBack } from '@/lib/useEscapeBack';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  BugStatus,
  DEFAULT_BUG_STATUSES,
} from '@/types/enums';
import type { CommentDto } from '@/types/dto';
import { useUsers } from '@/features/users/api';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from '@/features/activity/api';
import { useBugStatuses } from '@/features/settings/api';
import { useBug, useDeleteBug, useSetBugStatus, useUpdateBug } from './api';
import { SeverityBadge } from './components/SeverityBadge';

/** Uppercase muted label used for each sidebar meta row. */
const ROW_LABEL = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

export function BugDetailPage() {
  const { bugId } = useParams<{ bugId: string }>();
  const navigate = useNavigate();
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();
  useEscapeBack();

  const { data: bug, isLoading } = useBug(bugId);
  const update = useUpdateBug();
  const setStatus = useSetBugStatus();
  const remove = useDeleteBug();
  const { data: usersData } = useUsers({ limit: 100 }, isAdmin); // admin-only; assignee/mentions
  const users = usersData?.items ?? [];

  const { data: statusConfig } = useBugStatuses();
  const columns = statusConfig?.length ? statusConfig : DEFAULT_BUG_STATUSES;
  const statusLabel = (k: BugStatus) => columns.find((c) => c.key === k)?.label ?? k;

  const { data: comments } = useComments(bugId);
  const createComment = useCreateComment(bugId ?? '');
  const [commentBody, setCommentBody] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }
  if (!bug) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('bugs.notFound')}{' '}
        <Link
          to="/bugs"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('bugs.backToBoard')}
        </Link>
      </div>
    );
  }

  function save(input: Parameters<typeof update.mutate>[0]['input']) {
    update.mutate({ id: bug!.id, input });
  }

  function postComment() {
    const body = commentBody.trim();
    if (!body) return;
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

  return (
    <div>
      <BackLink to="/bugs">{t('bugs.backToBoard')}</BackLink>

      <div className="grid items-start gap-6 md:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {canWrite ? (
            <Input
              className="h-auto border-transparent bg-transparent px-1.5 py-1 text-xl font-semibold shadow-none hover:border-input"
              defaultValue={bug.title}
              onBlur={(e) =>
                e.target.value.trim() && e.target.value !== bug.title && save({ title: e.target.value })
              }
            />
          ) : (
            <h1 className="text-xl font-semibold tracking-tight">{bug.title}</h1>
          )}

          <Field label={t('bugs.description')}>
            {canWrite ? (
              <Textarea
                defaultValue={bug.description}
                placeholder={t('bugs.description')}
                onBlur={(e) => e.target.value !== bug.description && save({ description: e.target.value })}
              />
            ) : (
              <p className="text-muted-foreground">{bug.description || '—'}</p>
            )}
          </Field>

          <section className="mt-8 border-t pt-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('activity.title')}
              </h2>
            </div>
            <div className="mb-4 flex flex-col gap-4">
              {(comments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('activity.empty')}</p>
              ) : (
                (comments ?? []).map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    bugId={bugId ?? ''}
                    canEdit={canWrite && (c.authorId === user?.id || isAdmin)}
                  />
                ))
              )}
            </div>

            {canWrite && (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder={t('activity.placeholder')}
                />
                {isAdmin && users.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="shrink-0 text-muted-foreground">{t('activity.notify')}:</span>
                    <MultiSelect
                      className="min-w-0 flex-1"
                      placeholder={t('activity.notifyPlaceholder')}
                      value={mentionIds}
                      onChange={setMentionIds}
                      options={users
                        .filter((u) => u.id !== user?.id)
                        .map((u) => ({ value: u.id, label: u.name }))}
                    />
                  </div>
                )}
                <div className="flex justify-end">
                  <Button size="sm" onClick={postComment} loading={createComment.isPending}>
                    {t('activity.comment')}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm md:sticky md:top-6">
          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('bugs.status')}</span>
            {canWrite ? (
              <Select
                value={bug.status}
                onValueChange={(v) => setStatus.mutate({ id: bug.id, status: v as BugStatus })}
                // Colours come from the tenant's board config, so the dots match
                // the columns on /bugs exactly.
                options={columns.map((c) => ({
                  value: c.key,
                  label: <DotLabel color={c.color}>{c.label}</DotLabel>,
                }))}
              />
            ) : (
              <span className="text-sm">{statusLabel(bug.status)}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('bugs.severity')}</span>
            {canWrite ? (
              <Select
                value={bug.severity}
                onValueChange={(v) => save({ severity: v as BugSeverity })}
                options={BUG_SEVERITIES.map((s) => ({
                  value: s,
                  label: <DotLabel color={BUG_SEVERITY_COLOR[s]}>{BUG_SEVERITY_LABEL[s]}</DotLabel>,
                }))}
              />
            ) : (
              <SeverityBadge severity={bug.severity} />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('bugs.assignee')}</span>
            {isAdmin ? (
              <Combobox
                value={bug.assigneeId || ''}
                onChange={(v) => save({ assigneeId: v })}
                placeholder={t('bugs.unassigned')}
                options={[
                  { value: '', label: t('bugs.unassigned') },
                  ...users.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            ) : (
              <span className="text-sm">{bug.assigneeName || t('bugs.unassigned')}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('bugs.type')}</span>
            {canWrite ? (
              <Input defaultValue={bug.type} onBlur={(e) => e.target.value !== bug.type && save({ type: e.target.value })} />
            ) : (
              <span className="text-sm">{bug.type || '—'}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('bugs.reporter')}</span>
            <span className="text-sm">{bug.reporterName || '—'}</span>
          </div>

          {bug.caseId && bug.caseLabel && (
            <div className="flex flex-col gap-1">
              <span className={ROW_LABEL}>{t('bugs.linkedCase')}</span>
              {bug.projectId && bug.reportId ? (
                <Link
                  to={`/testing/${bug.projectId}/reports/${bug.reportId}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <span aria-hidden>🔗</span>
                  {bug.caseLabel}
                </Link>
              ) : (
                <span className="text-sm">{bug.caseLabel}</span>
              )}
            </div>
          )}

          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (confirm(t('bugs.confirmDelete')))
                  remove.mutate(bug.id, { onSuccess: () => navigate('/bugs') });
              }}
            >
              {t('bugs.delete')}
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

/** One comment in the activity thread — with inline edit + delete for the author (or admins). */
function CommentItem({
  comment,
  bugId,
  canEdit,
}: {
  comment: CommentDto;
  bugId: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const update = useUpdateComment(bugId);
  const remove = useDeleteComment(bugId);
  const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt;

  function saveEdit() {
    const body = draft.trim();
    if (!body) return;
    if (body === comment.body) {
      setEditing(false);
      return;
    }
    update.mutate({ id: comment.id, input: { body } }, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="group border-l-2 border-border pl-3">
      <div className="mb-0.5 flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{comment.authorName}</span>
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
        <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
      )}
    </div>
  );
}

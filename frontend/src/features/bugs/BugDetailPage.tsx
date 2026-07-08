import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
import { timeAgo } from '@/lib/format';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_LABEL,
  BUG_STATUS_LABEL,
  BUG_STATUSES,
  BugSeverity,
  BugStatus,
  Role,
} from '@/types/enums';
import { useUsers } from '@/features/users/api';
import { useComments, useCreateComment } from '@/features/activity/api';
import { useBug, useDeleteBug, useSetBugStatus, useUpdateBug } from './api';
import { SeverityBadge } from './components/SeverityBadge';

/** Uppercase muted label used for each sidebar meta row. */
const ROW_LABEL = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

export function BugDetailPage() {
  const { bugId } = useParams<{ bugId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === Role.ADMIN || user?.role === Role.TESTER;
  const isAdmin = user?.role === Role.ADMIN;

  const { data: bug, isLoading } = useBug(bugId);
  const update = useUpdateBug();
  const setStatus = useSetBugStatus();
  const remove = useDeleteBug();
  const { data: usersData } = useUsers({ limit: 100 }, isAdmin); // admin-only; assignee/mentions
  const users = usersData?.items ?? [];

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
                  <div key={c.id} className="border-l-2 border-border pl-3">
                    <div className="mb-0.5 flex items-baseline gap-2 text-sm">
                      <span className="font-semibold">{c.authorName}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                  </div>
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
                  <label className="flex items-center gap-2 text-sm">
                    <span className="shrink-0 text-muted-foreground">{t('activity.notify')}:</span>
                    <Select
                      className="h-auto min-h-9"
                      multiple
                      value={mentionIds}
                      onChange={(e) =>
                        setMentionIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                      }
                    >
                      {users
                        .filter((u) => u.id !== user?.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </Select>
                  </label>
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
                onChange={(e) => setStatus.mutate({ id: bug.id, status: e.target.value as BugStatus })}
              >
                {BUG_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {BUG_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-sm">{BUG_STATUS_LABEL[bug.status]}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('bugs.severity')}</span>
            {canWrite ? (
              <Select
                value={bug.severity}
                onChange={(e) => save({ severity: e.target.value as BugSeverity })}
              >
                {BUG_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {BUG_SEVERITY_LABEL[s]}
                  </option>
                ))}
              </Select>
            ) : (
              <SeverityBadge severity={bug.severity} />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={ROW_LABEL}>{t('bugs.assignee')}</span>
            {isAdmin ? (
              <Select
                value={bug.assigneeId}
                onChange={(e) => save({ assigneeId: e.target.value })}
              >
                <option value="">{t('bugs.unassigned')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
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

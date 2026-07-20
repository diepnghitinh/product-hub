import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button, Combobox, DotLabel, Input, Select, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  TeamIssueType,
} from '@/types/enums';
import { useUsers } from '@/features/users/api';
import { IssueDetailMain } from '@/features/issues/IssueDetailMain';
import { useTeamStatuses } from '@/features/teams/api';
import { useBug, useDeleteBug, useSetBugStatus, useUpdateBug } from '../api';
import { SeverityBadge } from './SeverityBadge';

/** Uppercase muted label used for each sidebar meta row. */
const ROW_LABEL = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

interface BugDetailProps {
  /** Bug shortId or uuid (`useBug` resolves either). */
  bugId: string | undefined;
  /** Called after a successful delete — the route navigates away, the inbox
   * clears its selection. When omitted, delete just refreshes. */
  onDeleted?: () => void;
}

/**
 * The full bug detail body — the shared <IssueDetailMain> (title · description ·
 * activity, identical to Task detail) beside the bug's own Properties sidebar.
 * Extracted from the route page so the inbox can render it inline in its detail
 * pane; the route page wraps this with the breadcrumb + Esc handling.
 */
export function BugDetail({ bugId, onDeleted }: BugDetailProps) {
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();

  const { data: bug, isLoading } = useBug(bugId);
  const update = useUpdateBug();
  const setStatus = useSetBugStatus();
  const remove = useDeleteBug();
  // Readable by any member now, so @-mentions in comments work for everyone.
  const { data: usersData } = useUsers({ limit: 100 });
  const users = usersData?.items ?? [];

  // Columns come from the team that owns this bug.
  const columns = useTeamStatuses(bug?.teamId, TeamIssueType.BUG);
  const statusLabel = (k: string) => columns.find((c) => c.key === k)?.label ?? k;

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
        <Link to="/bugs" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t('bugs.backToBoard')}
        </Link>
      </div>
    );
  }

  function save(input: Parameters<typeof update.mutate>[0]['input']) {
    update.mutate({ id: bug!.id, input });
  }

  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
      {/* ── Main column (shared with Task detail) ─────────────────────────── */}
      <IssueDetailMain
        key={bug.id}
        subject="bug"
        issueId={bug.id}
        shortId={bug.shortId}
        title={bug.title}
        titlePlaceholder={t('bugs.title2')}
        description={bug.description}
        descriptionPlaceholder={t('bugs.description')}
        createdByName={bug.reporterName}
        createdAt={bug.createdAt}
        createdLabel={t('bugs.reportedThis')}
        canWrite={canWrite}
        isAdmin={isAdmin}
        currentUserId={user?.id}
        users={users}
        onSaveTitle={(title) => save({ title })}
        onSaveDescription={(description) => save({ description })}
      />

      {/* ── Properties sidebar ────────────────────────────────────────────── */}
      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm md:sticky md:top-6">
        <div className="flex flex-col gap-1">
          <span className={ROW_LABEL}>{t('bugs.status')}</span>
          {canWrite ? (
            <Select
              value={bug.status}
              onValueChange={(v) => setStatus.mutate({ id: bug.id, status: v })}
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
              if (confirm(t('bugs.confirmDelete'))) remove.mutate(bug.id, { onSuccess: onDeleted });
            }}
          >
            {t('bugs.delete')}
          </Button>
        )}
      </aside>
    </div>
  );
}

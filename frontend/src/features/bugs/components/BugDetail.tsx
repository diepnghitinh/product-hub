import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Combobox, DotLabel, Input, Select, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  FavouriteKind,
  IssueKind,
  TeamIssueType,
} from '@/types/enums';
import { useUsers } from '@/features/users/api';
import { IssueDetail, PropField } from '@/features/issues/IssueDetail';
import { useTeamStatuses } from '@/features/teams/api';
import { useBug, useDeleteBug, useSetBugStatus, useUpdateBug } from '../api';
import { SeverityBadge } from './SeverityBadge';
import { useRelationActions } from '@/features/issues/useRelationActions';
import { IssueRelations } from '@/features/issues/IssueRelations';

interface BugDetailProps {
  /** Bug shortId or uuid (`useBug` resolves either). */
  bugId: string | undefined;
  /** Called after a successful delete — the route navigates away, the inbox
   * clears its selection. When omitted, delete just refreshes. */
  onDeleted?: () => void;
  /** 'topbar' on the standalone route (⋯ in the app header); 'header' (default)
   * in the inbox pane, which has no topbar of its own. */
  menuTarget?: 'header' | 'topbar';
}

/**
 * The full bug detail body — the shared <IssueDetail> (title · description ·
 * activity, identical to Task detail) with the bug's own Properties sidebar.
 * Extracted from the route page so the inbox can render it inline in its detail
 * pane; the route page wraps this with the breadcrumb + Esc handling.
 */
export function BugDetail({ bugId, onDeleted, menuTarget = 'header' }: BugDetailProps) {
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();

  const { data: bug, isLoading } = useBug(bugId);
  const update = useUpdateBug();
  const setStatus = useSetBugStatus();
  const remove = useDeleteBug();
  const { markAsItem, picker } = useRelationActions(IssueKind.BUG, bug?.id ?? '');
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
    <IssueDetail
      key={bug.id}
      subject="bug"
      issueId={bug.id}
      favourite={{ kind: FavouriteKind.BUG, refId: bug.id }}
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
      menuTarget={menuTarget}
      menuItems={[
        ...(canWrite ? [markAsItem] : []),
        ...(isAdmin
          ? [
              {
                label: t('bugs.delete'),
                danger: true,
                closeOnSelect: true,
                icon: <Trash2 className="size-4" />,
                onClick: () => {
                  if (confirm(t('bugs.confirmDelete')))
                    remove.mutate(bug.id, { onSuccess: onDeleted });
                },
              },
            ]
          : []),
      ]}
      sidebar={
        <>
          <PropField label={t('bugs.status')}>
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
          </PropField>

          <PropField label={t('bugs.severity')}>
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
          </PropField>

          <PropField label={t('bugs.assignee')}>
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
          </PropField>

          <PropField label={t('bugs.type')}>
            {canWrite ? (
              <Input
                defaultValue={bug.type}
                onBlur={(e) => e.target.value !== bug.type && save({ type: e.target.value })}
              />
            ) : (
              <span className="text-sm">{bug.type || '—'}</span>
            )}
          </PropField>

          <PropField label={t('bugs.reporter')}>
            <span className="text-sm">{bug.reporterName || '—'}</span>
          </PropField>

          {bug.caseId && bug.caseLabel && (
            <PropField label={t('bugs.linkedCase')}>
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
            </PropField>
          )}

          <IssueRelations subject={IssueKind.BUG} issueId={bug.id} canWrite={canWrite} />
          {picker}
        </>
      }
    />
  );
}

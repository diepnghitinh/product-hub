import { Link } from 'react-router-dom';
import {
  CalendarRange,
  CircleDot,
  FlaskConical,
  Trash2,
  TriangleAlert,
  Type,
  User,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  DateRangePicker,
  DotLabel,
  Input,
  MultiSelect,
  Select,
  formatDateRange,
} from '@/components/ui';
import { AssigneeField, fallbackNames } from '@/components/AssigneeField';
import { DetailSkeleton } from '@/components/Skeletons';
import { t } from '@/i18n';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  ClickUpLinkTarget,
  FavouriteKind,
  IssueKind,
  TeamIssueType,
} from '@/types/enums';
import { useUsers } from '@/features/users/api';
import { IssueDetail, PropField, PropSection, PropValue } from '@/features/issues/IssueDetail';
import { CiStatusField } from '@/features/issues/CiStatusField';
import {
  useTeams,
  useTeamStatuses,
  useTeamLabels,
  useTeamCustomFields,
} from '@/features/teams/api';
import { CyclePropField } from '@/features/cycles/CycleControls';
import { LabelChips, resolveLabels } from '@/features/labels/LabelChips';
import { CustomFields } from '@/features/custom-fields/CustomFields';
import { useBug, useDeleteBug, useSetBugStatus, useUpdateBug } from '../api';
import { BUG_TEMPLATES } from '../bugTemplates';
import { SeverityBadge } from './SeverityBadge';
import { useRelationActions } from '@/features/issues/useRelationActions';
import { IssueRelations } from '@/features/issues/IssueRelations';
import { ClickUpLinkPanel } from '@/features/clickup/ClickUpLinkPanel';

interface BugDetailProps {
  /** Bug shortId or uuid (`useBug` resolves either). */
  bugId: string | undefined;
  /** Called after a successful delete — the route navigates away, the inbox
   * clears its selection. When omitted, delete just refreshes. */
  onDeleted?: () => void;
  /** 'topbar' on the standalone route (⋯ in the app header); 'header' (default)
   * in the inbox pane, which has no topbar of its own. */
  menuTarget?: 'header' | 'topbar';
  /** Drawer (peek) layout — lays the Properties out two-per-row in a wider
   * sidebar. Off on the full-page route and the inbox pane, which stay one-column. */
  dense?: boolean;
}

/**
 * The full bug detail body — the shared <IssueDetail> (title · description ·
 * activity, identical to Task detail) with the bug's own Properties sidebar.
 * Extracted from the route page so the inbox can render it inline in its detail
 * pane; the route page wraps this with the breadcrumb + Esc handling.
 */
export function BugDetail({
  bugId,
  onDeleted,
  menuTarget = 'header',
  dense = false,
}: BugDetailProps) {
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
  // Labels are the bug's team's own set — the same source the settings editor writes.
  const teamLabels = useTeamLabels(bug?.teamId);
  const teamCustomFields = useTeamCustomFields(bug?.teamId);
  // The full team object — the cycle picker needs its `cyclesEnabled` config.
  const { data: teams } = useTeams();
  const team = teams?.find((tm) => tm.id === bug?.teamId);

  if (isLoading) {
    return <DetailSkeleton />;
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
      dense={dense}
      subject="bug"
      issueId={bug.id}
      favourite={{ kind: FavouriteKind.ISSUE, refId: bug.id }}
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
      branch={bug.branch}
      // Awaited, unlike the other saves: a branch name can come back 409 (taken)
      // and the editor shows that under the field instead of a toast.
      onSaveBranchName={(branchName) => update.mutateAsync({ id: bug.id, input: { branchName } })}
      attachments={bug.attachments}
      onAttachmentsChange={(attachments) => save({ attachments })}
      // Repro-steps shapes, offered on an empty description the way a backlog
      // item offers User Story / JTBD — a bug without steps can't be fixed.
      templates={BUG_TEMPLATES}
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
          <PropSection grid={dense} label={t('tasks.properties')}>
            <PropField bare label={t('bugs.status')}>
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
                <PropValue icon={<CircleDot />}>{statusLabel(bug.status)}</PropValue>
              )}
            </PropField>

            <PropField bare label={t('bugs.severity')}>
              {canWrite ? (
                <Select
                  value={bug.severity}
                  onValueChange={(v) => save({ severity: v as BugSeverity })}
                  options={BUG_SEVERITIES.map((s) => ({
                    value: s,
                    label: (
                      <DotLabel color={BUG_SEVERITY_COLOR[s]}>{BUG_SEVERITY_LABEL[s]}</DotLabel>
                    ),
                  }))}
                />
              ) : (
                <PropValue icon={<TriangleAlert />}>
                  <SeverityBadge severity={bug.severity} />
                </PropValue>
              )}
            </PropField>

            <PropField bare label={t('bugs.assignee')}>
              <AssigneeField
                multiple
                value={bug.assignees.map((a) => a.id)}
                onChange={(ids) => save({ assigneeIds: ids })}
                readOnly={!isAdmin}
                fallbackNames={fallbackNames(bug.assignees)}
                aria-label={t('bugs.assignee')}
              />
            </PropField>

            <PropField bare label={t('bugs.type')}>
              {canWrite ? (
                <Input
                  icon={<Type />}
                  // A bare row has no drawn label, so an empty free-text field
                  // would otherwise be an icon beside a blank box.
                  placeholder={t('bugs.type')}
                  aria-label={t('bugs.type')}
                  defaultValue={bug.type}
                  onBlur={(e) => e.target.value !== bug.type && save({ type: e.target.value })}
                />
              ) : (
                <PropValue icon={<Type />} muted={!bug.type}>
                  {bug.type || '—'}
                </PropValue>
              )}
            </PropField>

            <PropField bare label={t('bugs.dates')}>
              {canWrite ? (
                <DateRangePicker
                  start={bug.startDate}
                  end={bug.endDate}
                  onChange={(r) => save({ startDate: r.start, endDate: r.end })}
                  placeholder={t('bugs.setDates')}
                />
              ) : bug.startDate || bug.endDate ? (
                <PropValue icon={<CalendarRange />}>
                  {formatDateRange(bug.startDate, bug.endDate)}
                </PropValue>
              ) : (
                <PropValue icon={<CalendarRange />} muted>
                  {t('bugs.noDates')}
                </PropValue>
              )}
            </PropField>

            <CyclePropField
              team={team}
              value={bug.cycleId}
              canWrite={canWrite}
              carryOverCount={bug.carryOverCount}
              onChange={(v) => save({ cycleId: v })}
            />

            <PropField bare label={t('bugs.reporter')}>
              <PropValue icon={<User />} muted={!bug.reporterName}>
                {bug.reporterName || '—'}
              </PropValue>
            </PropField>

            <CiStatusField issue={bug} />

            <CustomFields
              fields={teamCustomFields}
              values={bug.customFields ?? {}}
              canWrite={canWrite}
              onChange={(next) => save({ customFields: next })}
            />

            {bug.caseId && bug.caseLabel && (
              <PropField bare label={t('bugs.linkedCase')}>
                <PropValue icon={<FlaskConical />}>
                  {bug.projectId && bug.reportId ? (
                    <Link
                      to={`/testing/${bug.projectId}/reports/${bug.reportId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {bug.caseLabel}
                    </Link>
                  ) : (
                    bug.caseLabel
                  )}
                </PropValue>
              </PropField>
            )}
          </PropSection>

          <PropSection label={t('labels.title')}>
            {canWrite ? (
              teamLabels.length > 0 ? (
                <MultiSelect
                  value={bug.labelKeys ?? []}
                  onChange={(keys) => save({ labelKeys: keys })}
                  placeholder={t('labels.pick')}
                  options={teamLabels.map((l) => ({
                    value: l.key,
                    label: <DotLabel color={l.color}>{l.name}</DotLabel>,
                    text: l.name,
                  }))}
                />
              ) : (
                <span className="text-xs text-muted-foreground">{t('labels.noneForTeam')}</span>
              )
            ) : resolveLabels(bug.labelKeys, teamLabels).length > 0 ? (
              <LabelChips keys={bug.labelKeys} labels={teamLabels} />
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </PropSection>

          <IssueRelations issueId={bug.id} canWrite={canWrite} />
          <ClickUpLinkPanel
            targetType={ClickUpLinkTarget.ISSUE}
            targetId={bug.id}
            canWrite={canWrite}
          />
          {picker}
        </>
      }
    />
  );
}

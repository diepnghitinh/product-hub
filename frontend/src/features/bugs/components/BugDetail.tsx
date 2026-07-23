import { Link } from 'react-router-dom';
import {
  CalendarRange,
  CircleDot,
  CircleUser,
  FlaskConical,
  Trash2,
  TriangleAlert,
  Type,
  User,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  Combobox,
  DateRangePicker,
  DotLabel,
  Input,
  MultiSelect,
  Select,
  Spinner,
  formatDateRange,
} from '@/components/ui';
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
import { IssueDetail, PropField, PropSection, PropValue } from '@/features/issues/IssueDetail';
import { useTeams, useTeamStatuses, useTeamLabels, useTeamCustomFields } from '@/features/teams/api';
import { CyclePropField } from '@/features/cycles/CycleControls';
import { LabelChips, resolveLabels } from '@/features/labels/LabelChips';
import { CustomFields } from '@/features/custom-fields/CustomFields';
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
  // Labels are the bug's team's own set — the same source the settings editor writes.
  const teamLabels = useTeamLabels(bug?.teamId);
  const teamCustomFields = useTeamCustomFields(bug?.teamId);
  // The full team object — the cycle picker needs its `cyclesEnabled` config.
  const { data: teams } = useTeams();
  const team = teams?.find((tm) => tm.id === bug?.teamId);

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
          <PropSection label={t('tasks.properties')}>
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
              {isAdmin ? (
                <Combobox
                  leadingIcon={<CircleUser />}
                  value={bug.assigneeId || ''}
                  onChange={(v) => save({ assigneeId: v })}
                  placeholder={t('bugs.unassigned')}
                  options={[
                    { value: '', label: t('bugs.unassigned') },
                    ...users.map((u) => ({ value: u.id, label: u.name })),
                  ]}
                />
              ) : (
                <PropValue icon={<CircleUser />} muted={!bug.assigneeName}>
                  {bug.assigneeName || t('bugs.unassigned')}
                </PropValue>
              )}
            </PropField>

            <PropField bare label={t('bugs.type')}>
              {canWrite ? (
                <Input
                  icon={<Type />}
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
                <span className="text-sm text-muted-foreground">{t('labels.noneForTeam')}</span>
              )
            ) : resolveLabels(bug.labelKeys, teamLabels).length > 0 ? (
              <LabelChips keys={bug.labelKeys} labels={teamLabels} />
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </PropSection>

          <IssueRelations subject={IssueKind.BUG} issueId={bug.id} canWrite={canWrite} />
          {picker}
        </>
      }
    />
  );
}

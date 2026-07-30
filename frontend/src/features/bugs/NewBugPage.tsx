import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FlaskConical, Type } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import {
  Button,
  DateRangePicker,
  DotLabel,
  Input,
  RichTextEditor,
  Select,
  Skeleton,
} from '@/components/ui';
import { AssigneeField } from '@/components/AssigneeField';
import { DescriptionTemplates, useTemplateSeed } from '@/components/DescriptionTemplates';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { Icon } from '@/components/Icon';
import {
  DetailGrid,
  PropField,
  PropSection,
  PropSidebar,
  PropValue,
} from '@/features/issues/IssueDetail';
import { useTeams, useTeamStatuses } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { CyclePropField } from '@/features/cycles/CycleControls';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  TeamIssueType,
} from '@/types/enums';
import { CenteredPageLayout } from '@/layouts/shared';
import { BUG_TEMPLATES } from './bugTemplates';
import { useCreateBug } from './api';

/**
 * Report a bug on a full page — the twin of `NewTaskPage`, and for the same
 * reason: it mirrors the bug-detail layout (title + rich description beside the
 * same Properties sidebar), so "New bug" and an open bug read as one screen.
 *
 * This replaced a four-field modal. A bug is the one issue that is *only* as
 * useful as its detail — a dialog with a bare textarea is what produces "checkout
 * is broken" and a developer's hour of guessing. The page has room for the repro
 * templates (the same ones bug detail offers) and every property the detail
 * sidebar exposes, so a report can be complete the moment it's filed.
 *
 * Everything is held in local draft state and written once on Create — nothing
 * persists until then, so the post-creation activity timeline (which needs a real
 * bug to hang comments on) is replaced by a short hint in its place.
 */
export function NewBugPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canManageDelivery } = useAuth();
  useEscapeBack();

  // The column a "+ Add" came from, and the team whose board opened this — both
  // ride in on the query string so a bug filed here lands where you expect.
  // Missing teamId is correct on the team-less /bugs route (default bug team).
  const teamId = searchParams.get('teamId') || undefined;
  const presetStatus = searchParams.get('status') || undefined;
  // A cycle-filtered board creates INTO its cycle (already resolved to a
  // concrete id by the board) — otherwise the new card would vanish from it.
  const presetCycleId = searchParams.get('cycleId') || undefined;
  // Filed from the Testing table ("report a bug on this case") or a project's
  // Bugs tab. Same param names the /bugs board already reads, so one link shape
  // covers both places.
  const projectId = searchParams.get('projectId') || undefined;
  const caseId = searchParams.get('caseId') || undefined;
  const caseLabel = searchParams.get('case') || undefined;
  const reportId = searchParams.get('reportId') || undefined;

  const create = useCreateBug();
  // Columns of the team that will own the bug (default bug team when standalone).
  const columns = useTeamStatuses(teamId, TeamIssueType.BUG);

  // Draft — every field the detail sidebar can set before the bug exists.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>(BugSeverity.MEDIUM);
  const [status, setStatus] = useState<string | undefined>(presetStatus);
  // Unassigned by default — a bug is reported *for* someone to pick up, unlike a
  // task, which the person creating it usually means to do.
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Seeded from the board that opened this (a cycle-filtered board), and editable
  // here via the same Cycle picker the detail sidebar shows.
  const [cycleId, setCycleId] = useState(presetCycleId ?? '');
  const [error, setError] = useState<string | null>(null);

  // Repro-steps shapes, offered on an empty description exactly as bug detail
  // offers them. Editor.js only reads `value` at mount, so applying one remounts
  // the editor via `nonce`.
  const seed = useTemplateSeed(description, setDescription);

  // Fall back to the first column so the Status select always shows a real value.
  const effectiveStatus = status ?? columns[0]?.key;

  // Breadcrumb: the bug's team board when known, otherwise the Bugs board.
  // /bugs/new isn't in the nav model, so this parent crumb is the breadcrumb root
  // and takes level 0's icon — a skeleton while teams load (never a guessed
  // icon), the team's own symbol once resolved, else the bug mark the standalone
  // board carries.
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const team = teams?.find((tm) => tm.id === teamId);
  const parent = team
    ? { to: `/teams/${team.id}`, label: team.name }
    : { to: '/bugs', label: t('bugs.title') };
  const leadingIcon = teamsLoading ? (
    <Skeleton className="size-4 shrink-0 rounded-full" />
  ) : team ? (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent/60 hover:text-accent-foreground">
      <TeamIconPicker team={team} readOnly size={16} className="shrink-0 text-muted-foreground" />
    </span>
  ) : (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm">
      <Icon name="bug" size={16} className="shrink-0 text-muted-foreground" />
    </span>
  );

  function submit() {
    if (!title.trim() || create.isPending) return;
    setError(null);
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        severity,
        status: effectiveStatus || undefined,
        // Sent so a team board's bug lands in that team, not the workspace default.
        teamId,
        cycleId: cycleId || undefined,
        assigneeIds,
        type: type.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        projectId,
        caseId,
        caseLabel,
        reportId,
      },
      {
        // Straight into the bug we just filed — replace, so Back skips the form
        // and returns to wherever it was opened from (a board, or the report).
        onSuccess: (bug) => navigate(`/issues/${bug.shortId || bug.id}`, { replace: true }),
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  return (
    <CenteredPageLayout>
      <PageHeader
        title={t('bugs.new')}
        parent={parent}
        leading={leadingIcon}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => navigate(-1)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={submit} loading={create.isPending} disabled={!title.trim()}>
              {t('common.create')}
            </Button>
          </div>
        }
      />

      <DetailGrid>
        {/* Main column — mirrors IssueDetailMain, minus the post-creation activity. */}
        <div className="min-w-0">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <input
            className="w-full min-w-0 border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
            value={title}
            placeholder={t('bugs.title2')}
            aria-label={t('bugs.title2')}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="mt-4">
            <DescriptionTemplates
              templates={BUG_TEMPLATES}
              hasContent={seed.hasContent}
              onApply={seed.apply}
            />
            <RichTextEditor
              key={`new-bug:${seed.nonce}`}
              value={seed.value}
              onChange={setDescription}
              placeholder={t('bugs.description')}
              minHeight={80}
              images
              // `@` names a person here too — a reference in the text, not a ping.
              mentions
              className="border-0"
            />
          </div>

          {/* Activity needs a real bug; until then, name the section and say so. */}
          <section className="mt-10 border-t pt-6">
            <h2 className="mb-2 text-base font-semibold">{t('activity.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('bugs.activityAfterCreate')}</p>
          </section>
        </div>

        {/* Properties — the same bare sidebar bug detail shows (icon rides inside
            each control), all editable before the bug exists. Labels, custom
            fields and relations need a saved bug, so they start on the detail. */}
        <PropSidebar>
          <PropSection label={t('tasks.properties')}>
            <PropField bare label={t('bugs.status')}>
              <Select
                value={effectiveStatus}
                onValueChange={setStatus}
                options={columns.map((c) => ({
                  value: c.key,
                  label: <DotLabel color={c.color}>{c.label}</DotLabel>,
                }))}
              />
            </PropField>

            <PropField bare label={t('bugs.severity')}>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as BugSeverity)}
                options={BUG_SEVERITIES.map((s) => ({
                  value: s,
                  label: <DotLabel color={BUG_SEVERITY_COLOR[s]}>{BUG_SEVERITY_LABEL[s]}</DotLabel>,
                }))}
              />
            </PropField>

            {/* Assigning is a manager's call on the detail page, so it is here too
                — for everyone else the bug files unassigned, as the old dialog
                always did, rather than showing a field they can't use. */}
            {canManageDelivery && (
              <PropField bare label={t('bugs.assignee')}>
                <AssigneeField
                  multiple
                  value={assigneeIds}
                  onChange={setAssigneeIds}
                  aria-label={t('bugs.assignee')}
                />
              </PropField>
            )}

            <PropField bare label={t('bugs.type')}>
              {/* A bare row draws no label, so an empty control has to name itself
                  — every other field here shows a value or a placeholder. */}
              <Input
                icon={<Type />}
                value={type}
                placeholder={t('bugs.type')}
                onChange={(e) => setType(e.target.value)}
              />
            </PropField>

            <PropField bare label={t('bugs.dates')}>
              <DateRangePicker
                start={startDate}
                end={endDate}
                onChange={(r) => {
                  setStartDate(r.start);
                  setEndDate(r.end);
                }}
                placeholder={t('bugs.setDates')}
              />
            </PropField>

            {/* Cycle — the same control the detail sidebar shows; renders nothing
                unless the team runs cycles (so nothing on the team-less route). */}
            <CyclePropField team={team} value={cycleId} canWrite onChange={setCycleId} />

            {/* Filed from a test case: show the link that's already decided, so the
                page says what it is about to attach itself to. */}
            {caseId && caseLabel && (
              <PropField bare label={t('bugs.linkedCase')}>
                <PropValue icon={<FlaskConical />}>{caseLabel}</PropValue>
              </PropField>
            )}
          </PropSection>
        </PropSidebar>
      </DetailGrid>
    </CenteredPageLayout>
  );
}

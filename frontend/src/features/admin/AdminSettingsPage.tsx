import { useEffect, useState, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  Copy,
  KeyRound,
  Plug,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  Webhook,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn, deepEqual } from '@/lib/utils';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  DatePicker,
  Dialog,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SaveButton,
  Select,
  Switch,
  TagInput,
} from '@/components/ui';
import { RowsSkeleton } from '@/components/Skeletons';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { timeAgo } from '@/lib/format';
import { env } from '@/lib/env';
import {
  ApiKeyScope,
  API_KEY_SCOPE_LABEL,
  builtinStatusKeys,
  CUSTOM_FIELD_TYPE_LABEL,
  CUSTOM_FIELD_TYPES,
  CustomFieldType,
  CYCLE_COOLDOWN_WEEKS,
  CYCLE_LENGTH_WEEKS,
  CycleMode,
  defaultStatusesFor,
  defaultTeamIcon,
  fieldTypeHasOptions,
  TEST_RESULTS,
} from '@/types/enums';
import type { CreatedApiKeyDto } from '@/types/dto';
import { useApiKeys, useGenerateApiKey, useRevokeApiKey } from '@/features/api-keys/api';
import { TeamsSection } from './TeamsSection';
import { TeamSymbol } from '@/components/TeamSymbol';
import {
  useTeams,
  useUpdateTeamStatuses,
  useUpdateTeamLabels,
  useUpdateTeamCustomFields,
} from '@/features/teams/api';
import { useUpdateCycleConfig } from '@/features/cycles/api';
import { TeamCyclePlanner } from '@/features/cycles/components/TeamCyclePlanner';
import type { TeamDto } from '@/types/dto';
import type { CustomFieldConfig, TaskLabelConfig } from '@/types/enums';
import { CloudStorageSection } from './CloudStorageSection';
import { McpSection } from './McpSection';
import { WebhooksSection } from './WebhooksSection';
import { CenteredPageLayout } from '@/layouts/shared';

/**
 * Left-menu sections, in order. `key` is the `?tab=` value.
 *
 * `adminOnly` sections are workspace-wide credentials, not delivery config: they
 * stay admin-only even though Product can manage teams and labels. Their data is
 * fetched behind the same gate (`GET /settings` is @Roles(ADMIN) and carries the
 * webhook config), so a Product user must never render them.
 */
const TABS: {
  key: string;
  labelKey: Parameters<typeof t>[0];
  icon: ComponentType<{ className?: string }>;
  Section: ComponentType;
  adminOnly?: boolean;
}[] = [
  { key: 'teams', labelKey: 'teams.title', icon: Users, Section: TeamsSection },
  { key: 'api-keys', labelKey: 'settings.apiKeys', icon: KeyRound, Section: ApiKeysSection, adminOnly: true },
  // Admin-only because connecting an assistant means generating a key, and keys
  // are `@Roles(ADMIN)` — the tab would render a Generate button that 403s.
  { key: 'mcp', labelKey: 'settings.mcp', icon: Plug, Section: McpSection, adminOnly: true },
  { key: 'webhooks', labelKey: 'settings.webhooks', icon: Webhook, Section: WebhooksSection, adminOnly: true },
  { key: 'storage', labelKey: 'settings.storage', icon: Cloud, Section: CloudStorageSection, adminOnly: true },
];

/** A team's own settings live at ?tab=team:<id>. */
const TEAM_TAB = 'team:';

export function AdminSettingsPage() {
  // Teams and labels are delivery config, which Product owns too — the backend
  // already says so (`@Roles(ADMIN, PRODUCT)` on every team endpoint). Only the
  // credential sections are narrowed further, via each tab's `adminOnly`.
  const { isAdmin, canManageDelivery } = useAuth();
  const tabs = TABS.filter((s) => !s.adminOnly || isAdmin);
  // Each team gets its own entry — statuses are per-team, so there's no
  // workspace-wide column editor any more.
  const { data: teams } = useTeams();
  const activeTeams = (teams ?? []).filter((x) => !x.archived);
  // Which section is open lives in the URL (?tab=api-keys), so it survives a
  // reload and is linkable — same pattern as the boards' ?view=.
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('tab');
  const activeTeam = param?.startsWith(TEAM_TAB)
    ? activeTeams.find((x) => x.id === param.slice(TEAM_TAB.length))
    : undefined;
  // Resolved against the *filtered* list, so hand-typing `?tab=webhooks` as a
  // non-admin falls back to Teams rather than mounting a section they can't read.
  const active = tabs.find((s) => s.key === param) ?? tabs[0];
  const setTab = (key: string) => {
    const next = new URLSearchParams(searchParams);
    if (key === tabs[0].key) next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  if (!canManageDelivery)
    return (
      <CenteredPageLayout>
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('settings.restricted')}
        </div>
      </CenteredPageLayout>
    );

  return (
    <CenteredPageLayout>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      {/* Left menu beside the content from md up; a scrolling tab strip on mobile. */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <nav
          aria-label={t('settings.title')}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
        >
          {tabs.map((s) => {
            const Icon = s.icon;
            const on = s.key === active.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setTab(s.key)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full',
                  on
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {t(s.labelKey)}
              </button>
            );
          })}

          {activeTeams.length > 0 && (
            <>
              <span className="mt-3 hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:block">
                {t('navgroup.teams')}
              </span>
              {activeTeams.map((team) => {
                const on = activeTeam?.id === team.id;
                return (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setTab(`${TEAM_TAB}${team.id}`)}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full',
                      on
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    <TeamSymbol
                      name={team.icon ?? defaultTeamIcon(team.issueType)}
                      size={16}
                      color={team.color ?? undefined}
                    />
                    {team.name}
                  </button>
                );
              })}
            </>
          )}
        </nav>

        <div className="min-w-0 flex-1">
          {activeTeam ? <TeamSettingsSection team={activeTeam} /> : <active.Section />}
        </div>
      </div>
    </CenteredPageLayout>
  );
}

type StatusColumn = { key: string; label: string; color: string };

/**
 * Shared board-columns editor for the bug + task settings sections. Built-ins
 * (relabel/recolor/reorder, no delete) and custom columns (add/delete), saved
 * as one array — the backend enforces that built-ins survive.
 */
function StatusColumnsEditor({
  title,
  hint,
  saveLabel,
  value,
  defaults,
  builtinKeys,
  onSave,
}: {
  title: string;
  hint: string;
  saveLabel: string;
  /** Current config from settings (undefined while loading). */
  value: StatusColumn[] | undefined;
  defaults: StatusColumn[];
  builtinKeys: Set<string>;
  onSave: (rows: StatusColumn[]) => Promise<unknown>;
}) {
  const [rows, setRows] = useState<StatusColumn[]>([]);
  const loading = value === undefined;
  // Save stays disabled until the columns differ from what's saved.
  const dirty = !deepEqual(rows, value ?? []);

  useEffect(() => {
    if (value?.length) setRows(value);
  }, [value]);

  function update(key: string, patch: Partial<StatusColumn>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    setRows((rs) => {
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function addColumn() {
    // Stable generated slug — the label is editable but the key mustn't change
    // once items reference it.
    const taken = new Set(rows.map((r) => r.key));
    let n = rows.length + 1;
    while (taken.has(`custom-${n}`)) n += 1;
    setRows((rs) => [...rs, { key: `custom-${n}`, label: 'New column', color: '#a855f7' }]);
  }
  function removeColumn(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{hint}</CardDescription>
        </div>
        <Button className="shrink-0" size="sm" variant="ghost" onClick={() => setRows(defaults)}>
          <RotateCcw className="mr-1.5 size-3.5" />
          {t('settings.resetDefaults')}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <RowsSkeleton />
        ) : (
          <div className="divide-y rounded-xl border">
            {rows.map((r, i) => (
              <div key={r.key} className="flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:px-4">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    aria-label={t('settings.moveUp')}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    aria-label={t('settings.moveDown')}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <input
                  type="color"
                  className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                  value={r.color}
                  aria-label={t('settings.statusColor')}
                  onChange={(e) => update(r.key, { color: e.target.value })}
                />
                <Input
                  className="min-w-0 flex-1 sm:max-w-xs"
                  value={r.label}
                  placeholder={t('settings.statusLabel')}
                  onChange={(e) => update(r.key, { label: e.target.value })}
                />
                <span className="font-mono text-xs text-muted-foreground">{r.key}</span>
                {builtinKeys.has(r.key) ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t('settings.builtIn')}
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeColumn(r.key)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <div className="p-2">
              <Button variant="ghost" size="sm" onClick={addColumn}>
                <Plus className="mr-1.5 size-3.5" />
                {t('settings.addColumn')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <SaveButton
          onSave={() => onSave(rows)}
          disabled={!dirty || rows.length === 0 || rows.some((r) => !r.label.trim())}
        >
          {saveLabel}
        </SaveButton>
      </CardFooter>
    </Card>
  );
}

/**
 * A single team's board columns. Statuses are per-team: two task teams can run
 * completely different workflows. Built-ins for the team's issue type are locked
 * (the rollups read their keys) — the backend enforces it too.
 */
function TeamSettingsSection({ team }: { team: TeamDto }) {
  const save = useUpdateTeamStatuses();
  return (
    <div className="space-y-6">
      <StatusColumnsEditor
        title={`${team.name} · ${t('settings.columns')}`}
        hint={t('settings.teamStatusesHint')}
        saveLabel={t('common.save')}
        value={team.statuses}
        defaults={defaultStatusesFor(team.issueType)}
        builtinKeys={builtinStatusKeys(team.issueType)}
        onSave={(rows) => save.mutateAsync({ id: team.id, statuses: rows })}
      />
      <TeamCyclesEditor team={team} />
      <TeamLabelsEditor team={team} />
      <CustomFieldsEditor team={team} />
    </div>
  );
}

/** Weeks label per rhythm value (t() takes no params, so plurals are enumerated). */
const CYCLE_WEEK_LABEL: Record<number, string> = {
  1: t('cycles.weeks1'),
  2: t('cycles.weeks2'),
  3: t('cycles.weeks3'),
  4: t('cycles.weeks4'),
};

/**
 * A team's sprint cadence — and, on a manual team, the cycles themselves.
 *
 * **Automatic** is the rhythm: enabling seeds the current + 2 upcoming cycles
 * server-side, the lazy scheduler rolls them forever, and disabling deletes the
 * upcoming ones (past cycles stay readable). Rhythm edits regenerate them, so
 * there is deliberately nothing to create by hand here.
 *
 * **Manual** stops generation and hands the calendar to the team. Every rhythm
 * control then goes inert (kept, not cleared, so switching back restores the old
 * rhythm) and `TeamCyclePlanner` takes their place: choosing the cadence and
 * planning the first cycle happen in one sitting, instead of sending someone off
 * to the Cycles page to find out where cycles come from. Ending a cycle stays
 * automatic in both: stats freeze and unfinished work rolls over.
 *
 * The rhythm rows are a draft saved by the footer button; the planner's own
 * actions save immediately, which is why it reads the *saved* team rather than
 * this editor's draft.
 */
function TeamCyclesEditor({ team }: { team: TeamDto }) {
  const save = useUpdateCycleConfig();
  const seed = () => ({
    cyclesEnabled: team.cyclesEnabled,
    cycleMode: team.cycleMode,
    cycleLengthWeeks: team.cycleLengthWeeks,
    cycleCooldownWeeks: team.cycleCooldownWeeks,
    cycleStartDate: team.cycleStartDate,
    cycleAutoRollover: team.cycleAutoRollover,
  });
  const [cfg, setCfg] = useState(seed);

  // Re-seed whenever the saved config round-trips (same pattern as labels).
  useEffect(
    () => setCfg(seed()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed reads exactly these
    [
      team.cyclesEnabled,
      team.cycleMode,
      team.cycleLengthWeeks,
      team.cycleCooldownWeeks,
      team.cycleStartDate,
      team.cycleAutoRollover,
    ],
  );

  const set = (patch: Partial<ReturnType<typeof seed>>) => setCfg((c) => ({ ...c, ...patch }));
  // Save stays disabled until the config actually changes — so re-saving an
  // unchanged config can't touch the team's already-created cycles.
  const base = seed();
  const dirty = !deepEqual(cfg, base);
  const manual = cfg.cycleMode === CycleMode.MANUAL;
  // A length / cooldown / start-date change on a team that was AND stays enabled
  // AND automatic triggers the server-side full rebuild — every cycle, frozen
  // history included, is wiped and regenerated from the new schedule. Confirm
  // first: it's irreversible. The rhythm is inert in manual mode, so a team
  // switching to it (or already on it) never rebuilds — matching the backend,
  // which requires auto on both sides of the save.
  const willRebuild =
    team.cyclesEnabled &&
    cfg.cyclesEnabled &&
    team.cycleMode !== CycleMode.MANUAL &&
    !manual &&
    (cfg.cycleLengthWeeks !== base.cycleLengthWeeks ||
      cfg.cycleCooldownWeeks !== base.cycleCooldownWeeks ||
      (cfg.cycleStartDate ?? null) !== (base.cycleStartDate ?? null));

  async function onSave() {
    // Reject on cancel — SaveButton's contract quietly reverts to idle, no toast.
    if (willRebuild && !confirm(t('cycles.rebuildConfirm'))) throw new Error('cancelled');
    return save.mutateAsync({ id: team.id, input: cfg });
  }
  const off = !cfg.cyclesEnabled;
  // Dim + disable the rhythm rows while cycles are off OR run by hand — the
  // values persist server-side either way, so switching back picks the old
  // rhythm up again.
  const inert = off || manual;
  const ROW = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3 sm:px-4 transition-opacity';
  const rowCls = cn(ROW, inert && 'opacity-50');
  // Rollover is NOT part of the rhythm: a manual team's cycles still end by
  // themselves, so where unfinished work goes is still a live choice there.
  const rolloverRowCls = cn(ROW, off && 'opacity-50');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cycles.title')}</CardTitle>
        <CardDescription>{t('cycles.teamHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-xl border">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3 sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('cycles.enable')}</p>
              <p className="text-xs text-muted-foreground">{t('cycles.enableHint')}</p>
            </div>
            <Switch
              checked={cfg.cyclesEnabled}
              onCheckedChange={(v) => set({ cyclesEnabled: v })}
              aria-label={t('cycles.enable')}
            />
          </div>
          {/* The cadence choice sits directly under the on/off switch, because
              it decides whether anything below it applies at all. */}
          <div
            className={cn(
              'flex flex-col gap-3 p-3 transition-opacity sm:px-4',
              off && 'opacity-50',
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('cycles.cadence')}</p>
              <p className="text-xs text-muted-foreground">{t('cycles.cadenceHint')}</p>
            </div>
            <RadioGroup
              className="gap-3 sm:grid-cols-2"
              disabled={off}
              value={cfg.cycleMode}
              onValueChange={(v) => set({ cycleMode: v as CycleMode })}
              aria-label={t('cycles.cadence')}
            >
              {[
                {
                  value: CycleMode.AUTO,
                  label: t('cycles.cadenceAuto'),
                  hint: t('cycles.cadenceAutoHint'),
                },
                {
                  value: CycleMode.MANUAL,
                  label: t('cycles.cadenceManual'),
                  hint: t('cycles.cadenceManualHint'),
                },
              ].map((opt) => (
                <Label
                  key={opt.value}
                  htmlFor={`cadence-${opt.value}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    !off && 'hover:bg-accent/40',
                    cfg.cycleMode === opt.value && 'border-primary bg-primary/5',
                  )}
                >
                  <RadioGroupItem
                    value={opt.value}
                    id={`cadence-${opt.value}`}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {opt.hint}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div className={rowCls}>
            <p className="text-sm font-medium">{t('cycles.length')}</p>
            <Select
              className="w-40"
              disabled={inert}
              value={String(cfg.cycleLengthWeeks)}
              onValueChange={(v) => set({ cycleLengthWeeks: Number(v) })}
              options={CYCLE_LENGTH_WEEKS.map((n) => ({
                value: String(n),
                label: CYCLE_WEEK_LABEL[n],
              }))}
              aria-label={t('cycles.length')}
            />
          </div>
          <div className={rowCls}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('cycles.cooldown')}</p>
              <p className="text-xs text-muted-foreground">{t('cycles.cooldownRowHint')}</p>
            </div>
            <Select
              className="w-40"
              disabled={inert}
              value={String(cfg.cycleCooldownWeeks)}
              onValueChange={(v) => set({ cycleCooldownWeeks: Number(v) })}
              options={CYCLE_COOLDOWN_WEEKS.map((n) => ({
                value: String(n),
                label: n === 0 ? t('cycles.noCooldown') : CYCLE_WEEK_LABEL[n],
              }))}
              aria-label={t('cycles.cooldown')}
            />
          </div>
          <div className={rowCls}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('cycles.startDate')}</p>
              <p className="text-xs text-muted-foreground">{t('cycles.startDateHint')}</p>
            </div>
            <DatePicker
              className="w-44"
              disabled={inert}
              value={cfg.cycleStartDate ?? ''}
              onChange={(v) => set({ cycleStartDate: v || null })}
              placeholder={t('cycles.startDatePlaceholder')}
            />
          </div>
          <div className={rolloverRowCls}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('cycles.autoRollover')}</p>
              <p className="text-xs text-muted-foreground">{t('cycles.autoRolloverHint')}</p>
            </div>
            <Switch
              disabled={off}
              checked={cfg.cycleAutoRollover}
              onCheckedChange={(v) => set({ cycleAutoRollover: v })}
              aria-label={t('cycles.autoRollover')}
            />
          </div>
        </div>
        {/* Shown the moment Manual is picked — including before the cadence is
            saved, where the planner says so instead of offering a button the
            API would reject. An automatic team has no calendar to plan. */}
        {!off && manual && <TeamCyclePlanner team={team} />}
      </CardContent>
      <CardFooter className="justify-between gap-4">
        {/* The rebuild warning is an automatic-team fact; a manual team is told
            where its cycles are actually created instead. */}
        <p className="text-xs text-muted-foreground">
          {manual ? t('cycles.manualNote') : t('cycles.rhythmChangeNote')}
        </p>
        <SaveButton onSave={onSave} disabled={!dirty}>
          {t('cycles.save')}
        </SaveButton>
      </CardFooter>
    </Card>
  );
}

/**
 * A single team's item labels — the one place labels are defined, shared by every
 * task/bug in the team (mirrors how statuses are per-team). No built-ins, and an
 * empty list is valid: a team may define none. `key` is the stable slug stored on
 * an item; name/colour are editable.
 */
function TeamLabelsEditor({ team }: { team: TeamDto }) {
  const save = useUpdateTeamLabels();
  const [rows, setRows] = useState<TaskLabelConfig[]>([]);
  // Save stays disabled until the labels differ from what's saved.
  const dirty = !deepEqual(rows, team.labels ?? []);

  // Re-seed from the server whenever the team's saved labels change (incl. after
  // a save round-trips). The team is already loaded here, so there's no spinner.
  useEffect(() => {
    setRows(team.labels ?? []);
  }, [team.labels]);

  function update(key: string, patch: Partial<TaskLabelConfig>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addLabel() {
    // Stable generated slug — the name is editable but the key mustn't change
    // once items reference it.
    const taken = new Set(rows.map((r) => r.key));
    let n = rows.length + 1;
    while (taken.has(`label-${n}`)) n += 1;
    setRows((rs) => [...rs, { key: `label-${n}`, name: 'New label', color: '#a855f7' }]);
  }
  function removeLabel(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('labels.title')}</CardTitle>
        <CardDescription>{t('labels.teamHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-xl border">
          {rows.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('labels.empty')}</p>
          )}
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:px-4">
              <input
                type="color"
                className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                value={r.color}
                aria-label={t('labels.color')}
                onChange={(e) => update(r.key, { color: e.target.value })}
              />
              <Input
                className="min-w-0 flex-1 sm:max-w-xs"
                value={r.name}
                placeholder={t('labels.name')}
                onChange={(e) => update(r.key, { name: e.target.value })}
              />
              <span className="font-mono text-xs text-muted-foreground">{r.key}</span>
              <button
                type="button"
                aria-label={t('common.delete')}
                className="ml-auto grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={() => removeLabel(r.key)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="p-2">
            <Button variant="ghost" size="sm" onClick={addLabel}>
              <Plus className="mr-1.5 size-3.5" />
              {t('labels.add')}
            </Button>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <SaveButton
          onSave={() => save.mutateAsync({ id: team.id, labels: rows })}
          disabled={!dirty || rows.some((r) => !r.name.trim())}
        >
          {t('labels.save')}
        </SaveButton>
      </CardFooter>
    </Card>
  );
}

/** Per-team custom fields (Jira/ClickUp-style). Mirrors the labels editor, with a
 *  type picker, an optional dropdown-options list, and a "required" toggle. `id` is
 *  a stable generated slug — the name/type/options stay editable. */
function CustomFieldsEditor({ team }: { team: TeamDto }) {
  const save = useUpdateTeamCustomFields();
  const [rows, setRows] = useState<CustomFieldConfig[]>([]);
  // Save stays disabled until the fields differ from what's saved.
  const dirty = !deepEqual(rows, team.customFields ?? []);

  useEffect(() => {
    setRows(team.customFields ?? []);
  }, [team.customFields]);

  function update(id: string, patch: Partial<CustomFieldConfig>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function changeType(id: string, type: CustomFieldType) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        // Seed an empty option list when switching to dropdown; drop it otherwise.
        const next: CustomFieldConfig = { ...r, type };
        if (fieldTypeHasOptions(type)) next.options = r.options ?? [];
        else delete next.options;
        return next;
      }),
    );
  }
  function addField() {
    const taken = new Set(rows.map((r) => r.id));
    let n = rows.length + 1;
    while (taken.has(`field-${n}`)) n += 1;
    setRows((rs) => [...rs, { id: `field-${n}`, name: 'New field', type: CustomFieldType.TEXT }]);
  }
  function removeField(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  const invalid =
    rows.some((r) => !r.name.trim()) ||
    rows.some((r) => fieldTypeHasOptions(r.type) && !(r.options ?? []).length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('customFields.title')}</CardTitle>
        <CardDescription>{t('customFields.teamHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-xl border">
          {rows.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t('customFields.empty')}
            </p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="space-y-2 p-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  className="min-w-0 flex-1 sm:max-w-xs"
                  value={r.name}
                  placeholder={t('customFields.namePlaceholder')}
                  onChange={(e) => update(r.id, { name: e.target.value })}
                />
                <Select
                  className="w-36 shrink-0"
                  value={r.type}
                  onValueChange={(v) => changeType(r.id, v as CustomFieldType)}
                  options={CUSTOM_FIELD_TYPES.map((ct) => ({
                    value: ct,
                    label: CUSTOM_FIELD_TYPE_LABEL[ct],
                  }))}
                />
                <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <Checkbox
                    checked={!!r.required}
                    onCheckedChange={(c) => update(r.id, { required: c === true })}
                  />
                  {t('customFields.required')}
                </label>
                <button
                  type="button"
                  aria-label={t('customFields.remove')}
                  className="ml-auto grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removeField(r.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {fieldTypeHasOptions(r.type) && (
                <TagInput
                  className="sm:max-w-md"
                  value={r.options ?? []}
                  onChange={(opts) => update(r.id, { options: opts })}
                  placeholder={t('customFields.optionsPlaceholder')}
                  aria-invalid={!(r.options ?? []).length}
                />
              )}
            </div>
          ))}
          <div className="p-2">
            <Button variant="ghost" size="sm" onClick={addField}>
              <Plus className="mr-1.5 size-3.5" />
              {t('customFields.add')}
            </Button>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <SaveButton
          onSave={() => save.mutateAsync({ id: team.id, customFields: rows })}
          disabled={!dirty || invalid}
        >
          {t('customFields.save')}
        </SaveButton>
      </CardFooter>
    </Card>
  );
}

function ApiKeysSection() {
  const { data, isLoading } = useApiKeys();
  const generate = useGenerateApiKey();
  const revoke = useRevokeApiKey();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedApiKeyDto | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const keys = data ?? [];

  // Reference cURL for the public "set result" endpoint. Built against the base
  // URL this app actually talks to (env.apiUrl already carries /v1) and the real
  // auth (x-api-key header, phk_ key prefix) — never a hardcoded host.
  const curlSnippet = [
    'curl -X PATCH \\',
    `  ${env.apiUrl}/public/testcases/{PROJECT_ID}/{TEST_CASE_ID} \\`,
    '  -H "x-api-key: phk_..." \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"result":"Passed"}'`,
  ].join('\n');
  const codeChip = 'rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground';

  function copyCurl() {
    navigator.clipboard?.writeText(curlSnippet);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1500);
  }

  function onGenerate() {
    if (!name.trim()) return;
    // Keys minted here are for the public API (the set-result endpoint), which
    // doesn't check scope — so they carry full ability. MCP-scoped keys are
    // created from the MCP tab, which offers the scope choice. (Whether scope
    // should also gate the public API is an open product decision.)
    generate.mutate(
      { name: name.trim(), scope: ApiKeyScope.READ_WRITE_DELETE },
      {
        onSuccess: (k) => {
          setCreated(k);
          setName('');
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.apiKeys')}</CardTitle>
        <CardDescription>{t('settings.apiKeysHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:max-w-lg sm:flex-row sm:items-center">
          <Input
            className="min-w-0 sm:flex-1"
            placeholder={t('settings.keyName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button className="sm:shrink-0" onClick={onGenerate} loading={generate.isPending}>
            {t('settings.generateKey')}
          </Button>
        </div>

        {isLoading ? (
          <RowsSkeleton />
        ) : keys.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {t('settings.noKeys')}
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:px-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">{k.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{k.prefix}</span>
                </div>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {API_KEY_SCOPE_LABEL[k.scope]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('settings.lastUsed')}: {k.lastUsedAt ? timeAgo(k.lastUsedAt) : t('settings.never')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => confirm(t('settings.confirmRevoke')) && revoke.mutate(k.id)}
                >
                  {t('settings.revoke')}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t('settings.apiUpdateEndpoint')}</h3>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={copyCurl}>
              <Copy className="mr-1.5 size-3.5" />
              {copiedCurl ? t('settings.copied') : t('settings.copyCurl')}
            </Button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
            <code>{curlSnippet}</code>
          </pre>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <code className={codeChip}>PROJECT_ID</code> {t('settings.apiGuideProjectId')}{' '}
            <code className={codeChip}>TEST_CASE_ID</code> {t('settings.apiGuideTestCaseId')}{' '}
            {t('settings.apiGuideResultsPrefix')} <code className={codeChip}>result</code>{' '}
            {t('settings.apiGuideResultsSuffix')} {TEST_RESULTS.join(', ')}.
          </p>
        </div>
      </CardContent>

      <Dialog
        open={!!created}
        onClose={() => {
          setCreated(null);
          setCopied(false);
        }}
        title={t('settings.generateKey')}
        footer={
          <Button
            onClick={() => {
              setCreated(null);
              setCopied(false);
            }}
          >
            Done
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">{t('settings.keyOnce')}</p>
        <div className="mt-3 flex items-center gap-3 rounded-md border bg-muted p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{created?.key}</code>
          <Button
            className="shrink-0"
            size="sm"
            variant="secondary"
            onClick={() => {
              if (created) navigator.clipboard?.writeText(created.key);
              setCopied(true);
            }}
          >
            {copied ? t('settings.copied') : t('settings.copy')}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}


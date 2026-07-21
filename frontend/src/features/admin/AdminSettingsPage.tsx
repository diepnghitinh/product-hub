import { useEffect, useState, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  Copy,
  KeyRound,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  Webhook,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  Input,
  Spinner,
} from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { timeAgo } from '@/lib/format';
import { env } from '@/lib/env';
import {
  builtinStatusKeys,
  defaultStatusesFor,
  defaultTeamIcon,
  TEST_RESULTS,
} from '@/types/enums';
import type { CreatedApiKeyDto } from '@/types/dto';
import { useApiKeys, useGenerateApiKey, useRevokeApiKey } from '@/features/api-keys/api';
import { TeamsSection } from './TeamsSection';
import { TeamSymbol } from '@/components/TeamSymbol';
import { useTeams, useUpdateTeamStatuses, useUpdateTeamLabels } from '@/features/teams/api';
import type { TeamDto } from '@/types/dto';
import type { TaskLabelConfig } from '@/types/enums';
import { CloudStorageSection } from './CloudStorageSection';
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
  saving,
}: {
  title: string;
  hint: string;
  saveLabel: string;
  /** Current config from settings (undefined while loading). */
  value: StatusColumn[] | undefined;
  defaults: StatusColumn[];
  builtinKeys: Set<string>;
  onSave: (rows: StatusColumn[]) => void;
  saving: boolean;
}) {
  const [rows, setRows] = useState<StatusColumn[]>([]);
  const loading = value === undefined;

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
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
          </div>
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
        <Button
          onClick={() => onSave(rows)}
          loading={saving}
          disabled={rows.length === 0 || rows.some((r) => !r.label.trim())}
        >
          {saveLabel}
        </Button>
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
        onSave={(rows) => save.mutate({ id: team.id, statuses: rows })}
        saving={save.isPending}
      />
      <TeamLabelsEditor team={team} />
    </div>
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
        <Button
          onClick={() => save.mutate({ id: team.id, labels: rows })}
          loading={save.isPending}
          disabled={rows.some((r) => !r.name.trim())}
        >
          {t('labels.save')}
        </Button>
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
    generate.mutate(name.trim(), {
      onSuccess: (k) => {
        setCreated(k);
        setName('');
      },
    });
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
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
          </div>
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


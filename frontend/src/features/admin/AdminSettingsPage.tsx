import { useEffect, useState, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  KeyRound,
  ListChecks,
  RotateCcw,
  Trash2,
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
  Checkbox,
  Dialog,
  Input,
  Label,
  Spinner,
  Switch,
} from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/components/PageHeader';
import { BackLink } from '@/components/BackLink';
import { timeAgo } from '@/lib/format';
import {
  BugStatus,
  BugStatusConfig,
  DEFAULT_BUG_STATUSES,  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABEL,
  WebhookEvent,
} from '@/types/enums';
import type { CreatedApiKeyDto, WebhookConfig } from '@/types/dto';
import { useApiKeys, useGenerateApiKey, useRevokeApiKey } from '@/features/api-keys/api';
import {
  useSettings,
  useUpdateBugStatuses,
  useUpdateWebhooks,
} from '@/features/settings/api';

/** Left-menu sections, in order. `key` is the `?tab=` value. */
const TABS: {
  key: string;
  labelKey: Parameters<typeof t>[0];
  icon: ComponentType<{ className?: string }>;
  Section: ComponentType;
}[] = [
  { key: 'bug-statuses', labelKey: 'settings.bugStatuses', icon: ListChecks, Section: BugStatusesSection },
  { key: 'api-keys', labelKey: 'settings.apiKeys', icon: KeyRound, Section: ApiKeysSection },
  { key: 'webhooks', labelKey: 'settings.webhooks', icon: Webhook, Section: WebhooksSection },
];

export function AdminSettingsPage() {
  const { isAdmin } = useAuth();
  // Which section is open lives in the URL (?tab=api-keys), so it survives a
  // reload and is linkable — same pattern as the boards' ?view=.
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('tab');
  const active = TABS.find((s) => s.key === param) ?? TABS[0];
  const setTab = (key: string) => {
    const next = new URLSearchParams(searchParams);
    if (key === TABS[0].key) next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  if (!isAdmin)
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Admins only.
      </div>
    );

  return (
    <div>
      <BackLink to="/">{t('nav.dashboard')}</BackLink>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      {/* Left menu beside the content from md up; a scrolling tab strip on mobile. */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <nav
          aria-label={t('settings.title')}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
        >
          {TABS.map((s) => {
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
        </nav>

        <div className="min-w-0 flex-1">
          <active.Section />
        </div>
      </div>
    </div>
  );
}

function BugStatusesSection() {
  const { data, isLoading } = useSettings();
  const save = useUpdateBugStatuses();
  const [rows, setRows] = useState<BugStatusConfig[]>([]);

  useEffect(() => {
    if (data?.bugStatuses?.length) setRows(data.bugStatuses);
  }, [data]);

  function update(key: BugStatus, patch: Partial<BugStatusConfig>) {
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

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{t('settings.bugStatuses')}</CardTitle>
          <CardDescription>{t('settings.bugStatusesHint')}</CardDescription>
        </div>
        <Button
          className="shrink-0"
          size="sm"
          variant="ghost"
          onClick={() => setRows(DEFAULT_BUG_STATUSES)}
        >
          <RotateCcw className="mr-1.5 size-3.5" />
          {t('settings.resetDefaults')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          onClick={() => save.mutate(rows)}
          loading={save.isPending}
          disabled={rows.length === 0 || rows.some((r) => !r.label.trim())}
        >
          {t('settings.saveBugStatuses')}
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

  const keys = data ?? [];

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

function WebhooksSection() {
  const { data, isLoading } = useSettings();
  const save = useUpdateWebhooks();
  const [hooks, setHooks] = useState<WebhookConfig[]>([]);

  useEffect(() => {
    if (data) setHooks(data.webhooks);
  }, [data]);

  function update(id: string, patch: Partial<WebhookConfig>) {
    setHooks((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }
  function toggleEvent(id: string, event: WebhookEvent) {
    setHooks((hs) =>
      hs.map((h) =>
        h.id === id
          ? {
              ...h,
              events: h.events.includes(event)
                ? h.events.filter((e) => e !== event)
                : [...h.events, event],
            }
          : h,
      ),
    );
  }
  function addHook() {
    setHooks((hs) => [
      ...hs,
      { id: crypto.randomUUID(), name: '', url: '', events: [WebhookEvent.BUG_CREATED], enabled: true },
    ]);
  }
  function removeHook(id: string) {
    setHooks((hs) => hs.filter((h) => h.id !== id));
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{t('settings.webhooks')}</CardTitle>
          <CardDescription>{t('settings.webhooksHint')}</CardDescription>
        </div>
        <Button className="shrink-0" size="sm" variant="secondary" onClick={addHook}>
          + {t('settings.addWebhook')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
          </div>
        ) : hooks.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {t('settings.noWebhooks')}
          </div>
        ) : (
          <div className="space-y-4">
            {hooks.map((h) => (
              <div key={h.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Input
                    className="min-w-0 flex-1"
                    placeholder={t('settings.webhookName')}
                    value={h.name}
                    onChange={(e) => update(h.id, { name: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                    onClick={() => removeHook(h.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Input
                  placeholder={t('settings.webhookUrl')}
                  value={h.url}
                  onChange={(e) => update(h.id, { url: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
                  <span className="text-muted-foreground">{t('settings.events')}:</span>
                  {WEBHOOK_EVENTS.map((ev) => {
                    const id = `${h.id}-${ev}`;
                    return (
                      <div key={ev} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={h.events.includes(ev)}
                          onCheckedChange={() => toggleEvent(h.id, ev)}
                        />
                        <Label htmlFor={id} className="cursor-pointer font-normal">
                          {WEBHOOK_EVENT_LABEL[ev]}
                        </Label>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`${h.id}-enabled`}
                      checked={h.enabled}
                      onCheckedChange={(checked) => update(h.id, { enabled: checked })}
                    />
                    <Label htmlFor={`${h.id}-enabled`} className="cursor-pointer font-normal">
                      {t('settings.enabled')}
                    </Label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => save.mutate(hooks)} loading={save.isPending}>
          {t('settings.saveWebhooks')}
        </Button>
      </CardFooter>
    </Card>
  );
}

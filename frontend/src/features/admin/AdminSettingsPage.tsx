import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
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
import { timeAgo } from '@/lib/format';
import { Role, WEBHOOK_EVENTS, WEBHOOK_EVENT_LABEL, WebhookEvent } from '@/types/enums';
import type { CreatedApiKeyDto, WebhookConfig } from '@/types/dto';
import { useApiKeys, useGenerateApiKey, useRevokeApiKey } from '@/features/api-keys/api';
import { useSettings, useUpdateWebhooks } from '@/features/settings/api';

export function AdminSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  if (!isAdmin)
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Admins only.
      </div>
    );

  return (
    <div>
      <PageHeader title={t('settings.title')} />
      <div className="space-y-6">
        <ApiKeysSection />
        <WebhooksSection />
      </div>
    </div>
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

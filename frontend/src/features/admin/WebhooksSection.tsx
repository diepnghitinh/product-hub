import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  Field,
  Input,
  Spinner,
  Switch,
} from '@/components/ui';
import { t } from '@/i18n';
import type { I18nKey } from '@/i18n/en';
import { cn } from '@/lib/utils';
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABEL,
  WEBHOOK_PROVIDERS,
  WebhookEvent,
  WebhookProvider,
} from '@/types/enums';
import type { WebhookConfig, WebhookMemberMapping } from '@/types/dto';
import { useSettings, useUpdateWebhooks } from '@/features/settings/api';
import { useUsers } from '@/features/users/api';
import { useAuth } from '@/lib/auth';

/** Provider brand name + descriptive copy shown in the card header. */
const PROVIDER_META: Record<WebhookProvider, { name: string; descKey: I18nKey }> = {
  [WebhookProvider.LARK]: { name: 'Lark', descKey: 'settings.webhookLarkDesc' },
  [WebhookProvider.TELEGRAM]: { name: 'Telegram', descKey: 'settings.webhookTelegramDesc' },
};

/** One-line description per event, shown under its title in the toggle rows. */
const EVENT_DESC: Record<WebhookEvent, I18nKey> = {
  [WebhookEvent.BUG_CREATED]: 'settings.eventBugCreatedDesc',
  [WebhookEvent.BUG_ASSIGNED]: 'settings.eventBugAssignedDesc',
  [WebhookEvent.COMMENT_MENTION]: 'settings.eventCommentMentionDesc',
};

type ByProvider = Record<WebhookProvider, WebhookConfig>;

function emptyHook(provider: WebhookProvider): WebhookConfig {
  return {
    id: crypto.randomUUID(),
    provider,
    name: PROVIDER_META[provider].name,
    url: '',
    botToken: '',
    chatId: '',
    events: [],
    enabled: false,
    memberMappings: [],
  };
}

/** Group the stored flat list into one editable card-model per provider. */
function seed(hooks: WebhookConfig[]): ByProvider {
  const pick = (p: WebhookProvider) =>
    hooks.find((h) => (h.provider ?? WebhookProvider.LARK) === p);
  return WEBHOOK_PROVIDERS.reduce((acc, p) => {
    const found = pick(p);
    acc[p] = found ? { ...emptyHook(p), ...found, provider: p } : emptyHook(p);
    return acc;
  }, {} as ByProvider);
}

/** A hook is worth persisting only once it's on or has a destination configured. */
function isBlank(h: WebhookConfig): boolean {
  return (
    !h.enabled &&
    !h.url?.trim() &&
    !h.botToken?.trim() &&
    !h.chatId?.trim() &&
    !(h.memberMappings?.length ?? 0)
  );
}

/** Trim fields and drop half-filled member rows before saving. */
function clean(h: WebhookConfig): WebhookConfig {
  return {
    ...h,
    name: h.name?.trim() || PROVIDER_META[h.provider].name,
    url: h.url?.trim() ?? '',
    botToken: h.botToken?.trim() || undefined,
    chatId: h.chatId?.trim() || undefined,
    memberMappings: (h.memberMappings ?? [])
      .filter((m) => m.userId && m.providerUserId.trim())
      .map((m) => ({
        userId: m.userId,
        providerUserId: m.providerUserId.trim(),
        displayName: m.displayName.trim(),
      })),
  };
}

/**
 * Configure outbound chat notifications, one card per provider (Lark, Telegram).
 * Each card holds its destination, the events that post to it, and a member
 * mapping so assignees/mentions get @pinged in their platform. Saved together.
 */
export function WebhooksSection() {
  const { isAdmin } = useAuth();
  const { data, isLoading } = useSettings();
  const { data: users } = useUsers({ limit: 100 }, isAdmin);
  const save = useUpdateWebhooks();
  const [byProvider, setByProvider] = useState<ByProvider>(() => seed([]));

  useEffect(() => {
    if (data) setByProvider(seed(data.webhooks));
  }, [data]);

  const memberOptions = useMemo(
    () => (users?.items ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
    [users],
  );

  function patch(p: WebhookProvider, next: Partial<WebhookConfig>) {
    setByProvider((s) => ({ ...s, [p]: { ...s[p], ...next } }));
  }
  function toggleEvent(p: WebhookProvider, ev: WebhookEvent) {
    setByProvider((s) => {
      const h = s[p];
      const events = h.events.includes(ev)
        ? h.events.filter((e) => e !== ev)
        : [...h.events, ev];
      return { ...s, [p]: { ...h, events } };
    });
  }
  function patchMember(p: WebhookProvider, i: number, next: Partial<WebhookMemberMapping>) {
    setByProvider((s) => {
      const mappings = [...(s[p].memberMappings ?? [])];
      mappings[i] = { ...mappings[i], ...next };
      return { ...s, [p]: { ...s[p], memberMappings: mappings } };
    });
  }
  function pickMember(p: WebhookProvider, i: number, userId: string) {
    const user = users?.items.find((u) => u.id === userId);
    setByProvider((s) => {
      const mappings = [...(s[p].memberMappings ?? [])];
      const displayName = mappings[i]?.displayName?.trim() || user?.name || '';
      mappings[i] = { ...mappings[i], userId, displayName };
      return { ...s, [p]: { ...s[p], memberMappings: mappings } };
    });
  }
  function addMember(p: WebhookProvider) {
    setByProvider((s) => ({
      ...s,
      [p]: {
        ...s[p],
        memberMappings: [
          ...(s[p].memberMappings ?? []),
          { userId: '', providerUserId: '', displayName: '' },
        ],
      },
    }));
  }
  function removeMember(p: WebhookProvider, i: number) {
    setByProvider((s) => ({
      ...s,
      [p]: { ...s[p], memberMappings: (s[p].memberMappings ?? []).filter((_, idx) => idx !== i) },
    }));
  }

  function onSave() {
    const hooks = WEBHOOK_PROVIDERS.map((p) => byProvider[p])
      .filter((h) => !isBlank(h))
      .map(clean);
    save.mutate(hooks, {
      onSuccess: () => toast.success(t('settings.webhooksSaved')),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('settings.webhooks')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.webhooksHint')}</p>
      </div>

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-10">
          <Spinner />
        </div>
      ) : (
        WEBHOOK_PROVIDERS.map((provider) => {
          const hook = byProvider[provider];
          const meta = PROVIDER_META[provider];
          const isLark = provider === WebhookProvider.LARK;
          const mappings = hook.memberMappings ?? [];

          return (
            <Card key={provider} className="overflow-hidden">
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>{meta.name}</CardTitle>
                  <CardDescription>{t(meta.descKey)}</CardDescription>
                </div>
                <Switch
                  className="mt-1 shrink-0"
                  checked={hook.enabled}
                  onCheckedChange={(v) => patch(provider, { enabled: v })}
                  aria-label={meta.name}
                />
              </CardHeader>

              {hook.enabled && (
                <CardContent className="space-y-6 border-t pt-6">
                  {/* Destination */}
                  {isLark ? (
                    <Field label={t('settings.webhookUrl')} htmlFor={`${provider}-url`}>
                      <Input
                        id={`${provider}-url`}
                        value={hook.url}
                        onChange={(e) => patch(provider, { url: e.target.value })}
                        placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/…"
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {t('settings.webhookLarkUrlHint')}
                      </p>
                    </Field>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t('settings.webhookTelegramToken')} htmlFor={`${provider}-token`}>
                        <Input
                          id={`${provider}-token`}
                          autoComplete="off"
                          value={hook.botToken ?? ''}
                          onChange={(e) => patch(provider, { botToken: e.target.value })}
                          placeholder="123456:ABC-DEF…"
                        />
                      </Field>
                      <Field label={t('settings.webhookTelegramChatId')} htmlFor={`${provider}-chat`}>
                        <Input
                          id={`${provider}-chat`}
                          value={hook.chatId ?? ''}
                          onChange={(e) => patch(provider, { chatId: e.target.value })}
                          placeholder="-1001234567890"
                        />
                      </Field>
                      <p className="-mt-1.5 text-xs text-muted-foreground sm:col-span-2">
                        {t('settings.webhookTelegramHint')}
                      </p>
                    </div>
                  )}

                  {/* Notifications */}
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold">{t('settings.webhookNotifications')}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.webhookNotificationsHint')}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {WEBHOOK_EVENTS.map((ev) => (
                        <div
                          key={ev}
                          className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{WEBHOOK_EVENT_LABEL[ev]}</div>
                            <div className="text-xs text-muted-foreground">{t(EVENT_DESC[ev])}</div>
                          </div>
                          <Switch
                            className="shrink-0"
                            checked={hook.events.includes(ev)}
                            onCheckedChange={() => toggleEvent(provider, ev)}
                            aria-label={WEBHOOK_EVENT_LABEL[ev]}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Member mapping */}
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold">{t('settings.webhookMemberMapping')}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          isLark
                            ? 'settings.webhookMemberMappingLarkHint'
                            : 'settings.webhookMemberMappingTelegramHint',
                        )}
                      </p>
                    </div>

                    {mappings.length > 0 && (
                      <div className="space-y-2">
                        {mappings.map((m, i) => (
                          <div
                            key={i}
                            className="flex flex-col gap-2 sm:flex-row sm:items-center"
                          >
                            <Combobox
                              className="w-full sm:w-56"
                              value={m.userId}
                              onChange={(v) => pickMember(provider, i, v)}
                              options={memberOptions}
                              placeholder={t('settings.webhookSelectMember')}
                              searchPlaceholder={t('settings.webhookSelectMember')}
                            />
                            <Input
                              className="w-full sm:flex-1"
                              value={m.providerUserId}
                              onChange={(e) =>
                                patchMember(provider, i, { providerUserId: e.target.value })
                              }
                              placeholder={t(
                                isLark
                                  ? 'settings.webhookOpenIdPlaceholder'
                                  : 'settings.webhookTelegramUserIdPlaceholder',
                              )}
                            />
                            <Input
                              className="w-full sm:w-40"
                              value={m.displayName}
                              onChange={(e) =>
                                patchMember(provider, i, { displayName: e.target.value })
                              }
                              placeholder={t('settings.webhookDisplayName')}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'shrink-0 self-end text-muted-foreground hover:text-destructive sm:self-auto',
                              )}
                              onClick={() => removeMember(provider, i)}
                              aria-label={t('settings.webhookRemoveMember')}
                            >
                              <X />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button variant="secondary" size="sm" onClick={() => addMember(provider)}>
                      + {t('settings.webhookAddMember')}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })
      )}

      <div className="flex justify-end">
        <Button onClick={onSave} loading={save.isPending} disabled={isLoading}>
          {t('settings.saveWebhooks')}
        </Button>
      </div>
    </div>
  );
}

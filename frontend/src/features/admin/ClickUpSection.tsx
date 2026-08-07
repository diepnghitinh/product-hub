import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Copy, Plug, Unplug } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Switch,
} from '@/components/ui';
import { RowsSkeleton } from '@/components/Skeletons';
import { ClickUpIcon } from '@/components/ClickUpIcon';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import type { ClickUpWorkspaceDto } from '@/types/dto';
import {
  useClickUpSettings,
  useConnectClickUp,
  useDisconnectClickUp,
  useProbeClickUp,
  useSetClickUpEnabled,
} from '@/features/settings/api';

/**
 * Settings → ClickUp.
 *
 * The opposite shape to Integrations next door: that one is inbound-only and the
 * screen is two strings you copy *out*. This one needs a credential, so the
 * screen is a token you paste *in* — which is why it's two steps (check the
 * token, then choose a workspace) and why the token is never shown again.
 *
 * The sync it sets up is deliberately narrow, and the screen says so in as many
 * words: ClickUp tells us a task changed, we mirror it beside the linked record,
 * and nothing is ever written back or allowed to move a status here.
 */
export function ClickUpSection() {
  const { data, isLoading } = useClickUpSettings();
  const disconnect = useDisconnectClickUp();
  const setEnabled = useSetClickUpEnabled();

  if (isLoading) return <RowsSkeleton />;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('settings.clickup')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.clickupHint')}</p>
      </div>

      <div className="space-y-2 rounded-xl border border-dashed p-4">
        <h3 className="text-sm font-semibold">{t('settings.clickupHow')}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('settings.clickupHowSteps')}
        </p>
      </div>

      {data?.connected ? (
        <Card className={cn('overflow-hidden', !data.enabled && 'opacity-70')}>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                <ClickUpIcon className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <CardTitle className="truncate text-base">
                  {data.workspaceName || t('settings.clickup')}
                </CardTitle>
                <CardDescription>
                  {t('settings.clickupToken')} {data.tokenPreview}
                  {!data.enabled && ` · ${t('settings.clickupPaused')}`}
                </CardDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                checked={data.enabled}
                disabled={setEnabled.isPending}
                onCheckedChange={(enabled) =>
                  setEnabled.mutate(enabled, { onError: (e) => toast.error((e as Error).message) })
                }
                aria-label={t('settings.clickup')}
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-4 border-t pt-6">
            {/* The one thing that can silently be wrong. Registering the webhook
                needs a token with the scope *and* a host ClickUp can reach, and
                a dev machine has neither — so say which state this is in. */}
            {!data.webhookActive && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span className="min-w-0 leading-relaxed">{t('settings.clickupNoWebhook')}</span>
              </div>
            )}

            <CopyRow label={t('settings.clickupWebhookUrl')} value={data.webhookUrl} />

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span
                className={cn(
                  'mt-1 size-2 shrink-0 rounded-full',
                  data.lastEventAt ? 'bg-success' : 'bg-muted-foreground/40',
                )}
              />
              {data.lastEventAt ? (
                <span className="min-w-0">
                  <span className="font-medium">{t('settings.integrationLastEvent')}</span>{' '}
                  <span className="text-muted-foreground">
                    {data.lastEventSummary} · {timeAgo(data.lastEventAt)}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">{t('settings.clickupWaiting')}</span>
              )}
            </div>

            <Button
              variant="destructive"
              loading={disconnect.isPending}
              onClick={() => {
                if (!confirm(t('settings.clickupDisconnectConfirm'))) return;
                disconnect.mutate(undefined, {
                  onSuccess: () => toast.success(t('settings.clickupDisconnected')),
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
            >
              <Unplug className="mr-1.5 size-4" />
              {t('settings.clickupDisconnect')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ConnectForm />
      )}
    </div>
  );
}

/**
 * Paste a token → pick a workspace → connect.
 *
 * Two steps rather than one form because an admin has a token long before they
 * know their numeric workspace id, and because a token that doesn't work should
 * fail on its own, with its own message, before anything is stored.
 */
function ConnectForm() {
  const probe = useProbeClickUp();
  const connect = useConnectClickUp();
  const [apiToken, setApiToken] = useState('');
  const [workspaces, setWorkspaces] = useState<ClickUpWorkspaceDto[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');

  function onProbe() {
    const token = apiToken.trim();
    if (!token) return toast.error(t('settings.clickupTokenRequired'));
    probe.mutate(token, {
      onSuccess: (list) => {
        setWorkspaces(list);
        setWorkspaceId(list[0]?.id ?? '');
      },
      onError: (e) => {
        setWorkspaces(null);
        toast.error((e as Error).message);
      },
    });
  }

  function onConnect() {
    const chosen = workspaces?.find((w) => w.id === workspaceId);
    if (!chosen) return;
    connect.mutate(
      { apiToken: apiToken.trim(), workspaceId: chosen.id, workspaceName: chosen.name },
      {
        onSuccess: (settings) => {
          // The token has done its job and has no reason to stay in a React
          // state a devtools panel can read.
          setApiToken('');
          setWorkspaces(null);
          toast.success(
            settings.webhookWarning
              ? `${t('settings.clickupConnected')} — ${settings.webhookWarning}`
              : t('settings.clickupConnected'),
          );
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.clickupConnect')}</CardTitle>
        <CardDescription>{t('settings.clickupTokenHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label={t('settings.clickupToken')} htmlFor="clickup-token">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="clickup-token"
              type="password"
              autoComplete="off"
              value={apiToken}
              onChange={(e) => {
                setApiToken(e.target.value);
                // Editing the token invalidates the list it produced — offering
                // a workspace found by a different token would connect the wrong
                // pair, and the server would then (rightly) refuse it.
                setWorkspaces(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && onProbe()}
              placeholder="pk_12345678_ABCDEFGHIJKLMNOPQRSTUVWXYZ"
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button variant="secondary" loading={probe.isPending} onClick={onProbe}>
              {t('settings.clickupCheck')}
            </Button>
          </div>
        </Field>

        {workspaces && (
          <>
            <Field label={t('settings.clickupWorkspace')} htmlFor="clickup-workspace">
              <Select
                id="clickup-workspace"
                value={workspaceId}
                onValueChange={setWorkspaceId}
                options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
              />
            </Field>
            <Button loading={connect.isPending} onClick={onConnect} disabled={!workspaceId}>
              <Plug className="mr-1.5 size-4" />
              {t('settings.clickupConnect')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** A read-only value with a copy button. Same shape as Integrations' row. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <Input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 font-mono text-xs"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground"
          onClick={copy}
          aria-label={t('settings.copy')}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

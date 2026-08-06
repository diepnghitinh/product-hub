import { useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  Field,
  Input,
  Menu,
  Select,
  Switch,
} from '@/components/ui';
import { RowsSkeleton } from '@/components/Skeletons';
import { GitProviderIcon } from '@/components/GitProviderIcon';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { GIT_PROVIDERS, GIT_PROVIDER_LABEL, GitProvider } from '@/types/enums';
import type { GitIntegrationDto } from '@/types/dto';
import {
  useDeleteIntegration,
  useIntegrations,
  useRotateIntegrationSecret,
  useSaveIntegration,
} from '@/features/settings/api';

/** What each host calls the two fields, and where they live. */
const SETUP_HINT: Record<GitProvider, Parameters<typeof t>[0]> = {
  [GitProvider.GITHUB]: 'settings.integrationSetupGithub',
  [GitProvider.GITLAB]: 'settings.integrationSetupGitlab',
};

/** Open state of the add/rename dialog — `null` when closed. */
type Editing = { id?: string; provider: GitProvider; name: string };

/**
 * Settings → Integrations.
 *
 * Connect a repo so its pipeline state shows on the issues it mentions. The
 * whole connection is **inbound**: we hand out a URL and a secret, the repo
 * posts to it, and we never store a token or call the git host. That's why the
 * screen is mostly two copyable strings and a "has anything arrived yet?" line
 * — those are the only things that can be wrong.
 */
export function IntegrationsSection() {
  const { data, isLoading } = useIntegrations();
  const save = useSaveIntegration();
  const rotate = useRotateIntegrationSecret();
  const remove = useDeleteIntegration();
  const [editing, setEditing] = useState<Editing | null>(null);

  const integrations = data ?? [];

  function onSubmit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return toast.error(t('settings.integrationNameRequired'));
    save.mutate(
      { id: editing.id, provider: editing.provider, name },
      {
        onSuccess: () => {
          setEditing(null);
          toast.success(t('settings.integrationSaved'));
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('settings.integrations')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.integrationsHint')}</p>
      </div>

      {/* The one thing that isn't obvious from the form: nothing links itself.
          A run only reaches an issue if a ref appears in the branch/title/message. */}
      <div className="space-y-2 rounded-xl border border-dashed p-4">
        <h3 className="text-sm font-semibold">{t('settings.integrationsHow')}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('settings.integrationsHowSteps')}
        </p>
        <p className="font-mono text-xs text-muted-foreground/80">
          {t('settings.integrationsRefExample')}
        </p>
      </div>

      {isLoading ? (
        <RowsSkeleton />
      ) : integrations.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('settings.integrationsEmpty')}
        </div>
      ) : (
        <div className="space-y-4">
          {integrations.map((i) => (
            <IntegrationCard
              key={i.id}
              integration={i}
              busy={save.isPending || rotate.isPending || remove.isPending}
              onToggle={(enabled) =>
                save.mutate(
                  { id: i.id, provider: i.provider, name: i.name, enabled },
                  { onError: (e) => toast.error((e as Error).message) },
                )
              }
              onRename={() => setEditing({ id: i.id, provider: i.provider, name: i.name })}
              onRotate={() => {
                if (!confirm(t('settings.integrationRotateConfirm'))) return;
                rotate.mutate(i.id, {
                  onSuccess: () => toast.success(t('settings.integrationRotated')),
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
              onDelete={() => {
                if (!confirm(t('settings.integrationDeleteConfirm'))) return;
                remove.mutate(i.id, {
                  onSuccess: () => toast.success(t('settings.integrationDeleted')),
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
            />
          ))}
        </div>
      )}

      <Button
        variant="secondary"
        onClick={() => setEditing({ provider: GitProvider.GITHUB, name: '' })}
      >
        <Plus className="mr-1.5 size-4" />
        {t('settings.integrationsAdd')}
      </Button>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('settings.integrationsAdd')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onSubmit} loading={save.isPending}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('settings.integrationProvider')} htmlFor="integration-provider">
          <Select
            id="integration-provider"
            value={editing?.provider ?? GitProvider.GITHUB}
            onValueChange={(v) =>
              setEditing((s) => (s ? { ...s, provider: v as GitProvider } : s))
            }
            options={GIT_PROVIDERS.map((p) => ({
              value: p,
              label: (
                <span className="flex items-center gap-2">
                  <GitProviderIcon provider={p} className="size-3.5" />
                  {GIT_PROVIDER_LABEL[p]}
                </span>
              ),
            }))}
          />
        </Field>
        <Field label={t('settings.integrationName')} htmlFor="integration-name">
          <Input
            id="integration-name"
            autoFocus
            value={editing?.name ?? ''}
            onChange={(e) => setEditing((s) => (s ? { ...s, name: e.target.value } : s))}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            placeholder={t('settings.integrationNamePlaceholder')}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('settings.integrationNameHint')}
          </p>
        </Field>
      </Dialog>
    </div>
  );
}

/** One connected repo: its two credentials, its switch, and its last delivery. */
function IntegrationCard({
  integration: i,
  busy,
  onToggle,
  onRename,
  onRotate,
  onDelete,
}: {
  integration: GitIntegrationDto;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onRename: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <Card className={cn('overflow-hidden', !i.enabled && 'opacity-70')}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
            <GitProviderIcon provider={i.provider} className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate text-base">{i.name}</CardTitle>
            {/* Wraps rather than truncates: "Paused — deliveries are rejected"
                is the one line here you must not clip, and on a phone the
                provider name alone already fills the row. */}
            <CardDescription>
              {GIT_PROVIDER_LABEL[i.provider]}
              {!i.enabled && ` · ${t('settings.integrationDisabled')}`}
            </CardDescription>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={i.enabled}
            disabled={busy}
            onCheckedChange={onToggle}
            aria-label={i.name}
          />
          <Menu
            trigger={
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
                <MoreHorizontal />
              </Button>
            }
            items={[
              { label: t('common.edit'), icon: <Pencil />, onClick: onRename },
              { label: t('settings.integrationRotate'), icon: <RefreshCw />, onClick: onRotate },
              {
                label: t('settings.integrationDelete'),
                icon: <Trash2 />,
                danger: true,
                onClick: onDelete,
              },
            ]}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 border-t pt-6">
        <CopyRow label={t('settings.integrationWebhookUrl')} value={i.webhookUrl} />
        <CopyRow label={t('settings.integrationSecret')} value={i.secret} secret={showSecret}>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground"
            onClick={() => setShowSecret((v) => !v)}
            aria-label={t(
              showSecret ? 'settings.integrationSecretHide' : 'settings.integrationSecretShow',
            )}
          >
            {showSecret ? <EyeOff /> : <Eye />}
          </Button>
        </CopyRow>

        <p className="text-xs leading-relaxed text-muted-foreground">{t(SETUP_HINT[i.provider])}</p>

        {/* The only proof the wiring works. Until something lands, "saved" and
            "connected" look identical, so say which one this is. */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <span
            className={cn(
              'mt-1 size-2 shrink-0 rounded-full',
              i.lastEventAt ? 'bg-success' : 'bg-muted-foreground/40',
            )}
          />
          {i.lastEventAt ? (
            <span className="min-w-0">
              <span className="font-medium">{t('settings.integrationLastEvent')}</span>{' '}
              <span className="text-muted-foreground">
                {i.lastEventSummary} · {timeAgo(i.lastEventAt)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t('settings.integrationWaiting')}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A read-only credential with a copy button. Read-only because both values are
 * minted server-side — an editable field would imply you could choose them.
 */
function CopyRow({
  label,
  value,
  secret,
  children,
}: {
  label: string;
  value: string;
  /** When defined, the value is masked until this is true. */
  secret?: boolean;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const masked = secret === false;

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
          // Always the real value in the DOM — masking is `-text-security`-free
          // here on purpose: a password input would let the browser offer to
          // save it, and this is a value you copy, not one you type.
          value={masked ? '•'.repeat(Math.min(value.length, 40)) : value}
          onFocus={(e) => !masked && e.currentTarget.select()}
          className="min-w-0 flex-1 font-mono text-xs"
        />
        {children}
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

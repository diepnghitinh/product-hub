import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  Input,
  Select,
} from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { RowsSkeleton } from '@/components/Skeletons';
import { t } from '@/i18n';
import { env } from '@/lib/env';
import { timeAgo } from '@/lib/format';
import { ApiKeyScope, API_KEY_SCOPES, API_KEY_SCOPE_LABEL, McpEntity } from '@/types/enums';
import type { CreatedApiKeyDto } from '@/types/dto';
import { useGenerateApiKey } from '@/features/api-keys/api';
import { useMcpEvents } from '@/features/mcp/api';

/** Stand-in used in the on-page snippet — the real key is only ever in the dialog. */
const KEY_PLACEHOLDER = 'phk_your_key_here';
const PAGE_SIZE = 20;

/** Remembers an edited endpoint, so the tab doesn't forget the public host. */
const ENDPOINT_KEY = 'ph_mcp_endpoint';

/** The URL this browser talks to, which is the right answer on a single host. */
const defaultEndpoint = () => `${env.apiUrl.replace(/\/$/, '')}/mcp`;

/** Which icon a history row wears, from the one field the API sends. */
const ENTITY_ICON: Record<McpEntity, IconName> = {
  [McpEntity.TASK]: 'tasks',
  [McpEntity.BUG]: 'bug',
  [McpEntity.BACKLOG_ITEM]: 'roadmap',
  [McpEntity.DOC]: 'docs',
  [McpEntity.COMMENT]: 'comment',
};

/** The verb a history row leads with, read from the event's `tool`. Robots now
 *  edit and delete too, so a row can no longer be assumed to be a "create". */
function toolVerb(tool: string): string {
  if (tool === 'add_comment') return t('settings.mcpVerbCommented');
  if (tool === 'set_issue_status') return t('settings.mcpVerbMoved');
  if (tool.startsWith('update_')) return t('settings.mcpVerbUpdated');
  if (tool.startsWith('delete_')) return t('settings.mcpVerbDeleted');
  return t('settings.mcpVerbCreated');
}

/**
 * Settings → MCP.
 *
 * Two jobs: get an assistant connected — generate a key, then copy the one
 * command that registers this API's own MCP endpoint — and show what those
 * assistants have created, so work arriving through a robot is as visible as
 * work typed in.
 *
 * The endpoint is editable rather than fixed, because the address the browser
 * uses and the address the assistant can reach are only the same URL when
 * everything runs on one machine.
 */
export function McpSection() {
  const generate = useGenerateApiKey();
  const [name, setName] = useState(t('settings.mcpKeyNameDefault'));
  const [scope, setScope] = useState<ApiKeyScope>(ApiKeyScope.READ_ONLY);
  const [created, setCreated] = useState<CreatedApiKeyDto | null>(null);
  const [endpoint, setEndpoint] = useState(
    () => localStorage.getItem(ENDPOINT_KEY) || defaultEndpoint(),
  );
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading } = useMcpEvents(1, limit);

  const events = data?.items ?? [];
  const total = data?.total ?? 0;

  const addCommand = (key: string) =>
    [
      'claude mcp add --transport http product-os \\',
      `  ${endpoint.trim() || defaultEndpoint()} \\`,
      `  --header "x-api-key: ${key}"`,
    ].join('\n');

  function onEndpointChange(value: string) {
    setEndpoint(value);
    localStorage.setItem(ENDPOINT_KEY, value);
  }

  function onGenerate() {
    if (!name.trim()) return;
    generate.mutate({ name: name.trim(), scope }, { onSuccess: setCreated });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.mcp')}</CardTitle>
          <CardDescription>{t('settings.mcpHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Step n={1} title={t('settings.mcpStep1')} hint={t('settings.mcpStep1Hint')}>
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
            <div className="mt-3 sm:max-w-lg">
              <label
                htmlFor="mcp-scope"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                {t('settings.mcpKeyScope')}
              </label>
              <Select
                id="mcp-scope"
                value={scope}
                onValueChange={(v) => setScope(v as ApiKeyScope)}
                options={API_KEY_SCOPES.map((s) => ({
                  value: s,
                  label: API_KEY_SCOPE_LABEL[s],
                }))}
              />
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {t('settings.mcpKeyScopeHint')}
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('settings.mcpKeysNote')}</p>
          </Step>

          <Step n={2} title={t('settings.mcpStep2')} hint={t('settings.mcpStep2Hint')}>
            <div className="space-y-4">
              <div className="sm:max-w-lg">
                <label
                  htmlFor="mcp-endpoint"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  {t('settings.mcpEndpoint')}
                </label>
                <Input
                  id="mcp-endpoint"
                  value={endpoint}
                  onChange={(e) => onEndpointChange(e.target.value)}
                  placeholder={defaultEndpoint()}
                />
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {t('settings.mcpEndpointHint')}
                </p>
              </div>
              <Snippet code={addCommand(KEY_PLACEHOLDER)} />
            </div>
          </Step>

          <div className="space-y-3 rounded-xl border border-dashed p-4 text-sm leading-relaxed text-muted-foreground">
            <p>{t('settings.mcpTools')}</p>
            <p className="text-xs">{t('settings.mcpDesktopNote')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.mcpHistory')}</CardTitle>
          <CardDescription>{t('settings.mcpHistoryHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <RowsSkeleton />
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              {t('settings.mcpNoHistory')}
            </div>
          ) : (
            <>
              <div className="divide-y rounded-xl border">
                {events.map((e) => {
                  // Who made the call, and when. Rendered twice — trailing on a wide
                  // row, stacked under the title on a phone — because letting it wrap
                  // leaves the title fighting it for the same line.
                  const trail = (
                    <>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {e.clientName}
                      </span>
                      <span className="text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
                    </>
                  );
                  return (
                    <Link
                      key={e.id}
                      to={e.link}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/60 sm:gap-4 sm:px-4"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon name={ENTITY_ICON[e.entity] ?? 'tasks'} size={16} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">{e.entityTitle}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[toolVerb(e.tool), e.entityRef, e.contextLabel, e.userName]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <span className="flex items-center gap-2 pt-1 sm:hidden">{trail}</span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-3 sm:flex">{trail}</span>
                    </Link>
                  );
                })}
              </div>
              {events.length < total && (
                <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  {t('settings.mcpShowMore')}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* The one moment the key exists in the clear — so it comes with the exact
          command to paste, not just the string. */}
      <Dialog
        open={!!created}
        onClose={() => setCreated(null)}
        title={t('settings.mcpReady')}
        footer={<Button onClick={() => setCreated(null)}>{t('common.done')}</Button>}
      >
        <p className="text-sm text-muted-foreground">{t('settings.keyOnce')}</p>
        <div className="mt-3 space-y-4">
          <Snippet code={created?.key ?? ''} />
          <div>
            <p className="mb-2 text-sm text-muted-foreground">{t('settings.mcpReadyHint')}</p>
            <Snippet code={addCommand(created?.key ?? '')} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** One numbered setup step — the badge keeps the sequence readable on mobile. */
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex gap-3 sm:gap-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mb-3 mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
        {children}
      </div>
    </section>
  );
}

/** A copyable code block. Horizontally scrollable so a long command never
 *  stretches the settings column on a phone. */
function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="shrink-0" onClick={copy}>
          <Copy className="mr-1.5 size-3.5" />
          {copied ? t('settings.copied') : t('settings.copy')}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

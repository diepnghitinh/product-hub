import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Unlink } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  SaveButton,
  Select,
  Switch,
  type SelectOption,
} from '@/components/ui';
import { RowsSkeleton } from '@/components/Skeletons';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useClickUpSettings } from '@/features/settings/api';
import type { ClickUpSyncScope } from '@/types/enums';
import {
  useClickUpListStatuses,
  useClickUpLists,
  useClickUpSpaces,
  useClickUpSync,
  useDeleteClickUpSync,
  useSaveClickUpSync,
} from './syncApi';

/**
 * Bind one board — a team's, or a roadmap's — to a ClickUp list.
 *
 * One editor for both, because the two boards differ only in where their columns
 * come from; the server already reads a team's statuses and a roadmap's columns
 * as the same thing, so the form does too.
 *
 * The shape follows what someone actually has to decide, in order: *which list*
 * (space → list), then *which column means what* (the mapping), then *is it on*.
 * The mapping arrives pre-filled — the server suggests one the moment a list is
 * picked — so the common case where both boards use the obvious words is a
 * glance and a Save rather than a screen of dropdowns.
 *
 * Everything admin-only, on both mount points.
 */
export function ClickUpSyncEditor({
  scope,
  scopeId,
  title,
  variant = 'card',
}: {
  scope: ClickUpSyncScope;
  scopeId: string;
  /** Card title. Ignored by the `plain` variant, where the dialog names it. */
  title?: ReactNode;
  /** `card` in a settings page; `plain` inside a dialog that has its own frame. */
  variant?: 'card' | 'plain';
}) {
  const settings = useClickUpSettings();
  const sync = useClickUpSync(scope, scopeId);
  const save = useSaveClickUpSync(scope, scopeId);
  const remove = useDeleteClickUpSync(scope, scopeId);

  const [spaceId, setSpaceId] = useState('');
  const [listId, setListId] = useState('');
  const [enabled, setEnabled] = useState(true);
  /** column key → ClickUp status name ('' = this column doesn't sync). */
  const [map, setMap] = useState<Record<string, string>>({});

  const data = sync.data;
  const connected = !!settings.data?.connected;
  const paused = connected && !settings.data?.enabled;

  // Re-seed the form whenever the *saved* binding changes — first load, after a
  // save (the server reconciles, so what comes back outranks what we sent) and
  // after an unbind. Keyed on the binding's content rather than the query object
  // so a background refetch of identical data doesn't wipe an edit in progress.
  const seededFrom = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const stamp = [
      data.bound,
      data.listId,
      data.spaceId,
      data.enabled,
      data.statusMap.map((p) => `${p.key}:${p.clickupStatus}`).join(','),
    ].join('|');
    if (seededFrom.current === stamp) return;
    seededFrom.current = stamp;
    setSpaceId(data.spaceId);
    setListId(data.listId);
    setEnabled(data.bound ? data.enabled : true);
    setMap(Object.fromEntries(data.statusMap.map((p) => [p.key, p.clickupStatus])));
  }, [data]);

  const spaces = useClickUpSpaces(connected && !paused);
  const lists = useClickUpLists(spaceId || undefined);

  // A list the admin just picked needs its statuses (and a suggestion) fetched;
  // the one already bound came with the binding, so re-reading it would be a
  // round trip to ClickUp for something already in hand.
  const pickedNew = !!listId && listId !== data?.listId;
  const probe = useClickUpListStatuses(scope, scopeId, pickedNew ? listId : undefined);
  const listStatuses = pickedNew ? (probe.data?.statuses ?? []) : (data?.listStatuses ?? []);

  const suggestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!pickedNew || !probe.data || suggestedFor.current === listId) return;
    suggestedFor.current = listId;
    setMap(Object.fromEntries(probe.data.suggested.map((p) => [p.key, p.clickupStatus])));
  }, [pickedNew, probe.data, listId]);

  const columns = data?.columns ?? [];
  const savedMap = useMemo(
    () => Object.fromEntries((data?.statusMap ?? []).map((p) => [p.key, p.clickupStatus])),
    [data],
  );
  const dirty =
    !!data &&
    (listId !== data.listId ||
      enabled !== (data.bound ? data.enabled : true) ||
      columns.some((c) => (map[c.key] ?? '') !== (savedMap[c.key] ?? '')));

  /**
   * The list's statuses, plus any mapped status the list didn't return. That
   * second part matters when ClickUp is unreachable: the binding still renders
   * with what it's configured to do instead of silently showing every row blank.
   */
  const statusOptions = useMemo<SelectOption[]>(() => {
    const known = new Set(listStatuses.map((s) => s.name));
    const orphans = [...new Set(Object.values(map).filter((v) => v && !known.has(v)))];
    return [
      {
        value: '',
        label: <span className="text-muted-foreground">{t('clickup.doesNotSync')}</span>,
      },
      ...listStatuses.map((s) => ({
        value: s.name,
        label: (
          <span className="flex min-w-0 items-center gap-2">
            {/* ClickUp's own colour — this dot is a quotation, like the one on a
                linked task. Everything branded here stays on our palette. */}
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color || 'currentColor' }}
            />
            <span className="truncate capitalize">{s.name}</span>
          </span>
        ),
      })),
      ...orphans.map((name) => ({
        value: name,
        label: <span className="truncate capitalize">{name}</span>,
      })),
    ];
  }, [listStatuses, map]);

  function onPickSpace(next: string) {
    setSpaceId(next);
    // The list belonged to the old space; keeping its id selected would show a
    // picker whose value isn't in it. Re-picking the bound list restores its map.
    if (next !== data?.spaceId) setListId('');
  }

  function onPickList(next: string) {
    setListId(next);
    if (next === data?.listId) {
      suggestedFor.current = null;
      setMap({ ...savedMap });
    }
  }

  async function onSave() {
    const list = lists.data?.find((l) => l.id === listId);
    const space = spaces.data?.find((s) => s.id === spaceId);
    try {
      await save.mutateAsync({
        listId,
        listName: list?.name ?? data?.listName ?? '',
        spaceId: spaceId || data?.spaceId || '',
        spaceName: space?.name ?? data?.spaceName ?? '',
        enabled,
        statusMap: columns.map((c) => ({ key: c.key, clickupStatus: map[c.key] ?? '' })),
      });
      toast.success(t('clickup.syncSaved'));
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  }

  function onUnbind() {
    if (!confirm(t('clickup.unbindConfirm'))) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        suggestedFor.current = null;
        toast.success(t('clickup.unbound'));
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  const loading = settings.isLoading || sync.isLoading;
  const listError = (lists.error ?? spaces.error ?? probe.error) as Error | undefined;

  const body = loading ? (
    <RowsSkeleton rows={3} />
  ) : !connected ? (
    <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
      {t('clickup.syncNotConnected')}
    </p>
  ) : (
    <div className="space-y-5">
      {paused && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span className="min-w-0 leading-relaxed">{t('clickup.syncPaused')}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('clickup.space')} htmlFor={`cu-space-${scopeId}`}>
          <Select
            id={`cu-space-${scopeId}`}
            value={spaceId}
            onValueChange={onPickSpace}
            disabled={spaces.isLoading || paused}
            placeholder={t('clickup.chooseSpace')}
            options={(spaces.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
        <Field label={t('clickup.list')} htmlFor={`cu-list-${scopeId}`}>
          <Select
            id={`cu-list-${scopeId}`}
            value={listId}
            onValueChange={onPickList}
            disabled={!spaceId || lists.isLoading || paused}
            placeholder={lists.isLoading ? t('common.loading') : t('clickup.chooseList')}
            options={(lists.data ?? []).map((l) => ({
              value: l.id,
              label: l.folderName ? `${l.folderName} / ${l.name}` : l.name,
            }))}
          />
        </Field>
      </div>

      {listError && <p className="text-xs text-destructive">{listError.message}</p>}

      {listId && (
        <div className="space-y-2">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{t('clickup.statusMapping')}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('clickup.statusMappingHint')}
            </p>
          </div>

          {probe.isLoading ? (
            <RowsSkeleton rows={3} />
          ) : (
            <div className="divide-y rounded-xl border">
              {columns.map((c) => (
                <div
                  key={c.key}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
                >
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{c.label}</span>
                    <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                      {c.key}
                    </span>
                  </div>
                  <ArrowRight className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
                  <Select
                    className="w-full sm:w-56"
                    value={map[c.key] ?? ''}
                    onValueChange={(v) => setMap((m) => ({ ...m, [c.key]: v }))}
                    options={statusOptions}
                    disabled={paused}
                    aria-label={`${c.label} → ClickUp`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start justify-between gap-4 rounded-xl border px-3 py-2.5 sm:px-4">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{t('clickup.syncEnabled')}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('clickup.syncEnabledHint')}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label={t('clickup.syncEnabled')}
            />
          </div>

          {/* Said where the decision is made: this is the one screen that turns a
              one-way mirror into writes, and the direction isn't symmetric. */}
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t('clickup.syncDirectionNote')}
          </p>
        </div>
      )}
    </div>
  );

  const actions =
    loading || !connected ? null : (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        {data?.bound && (
          <Button
            variant="ghost"
            className="mr-auto text-muted-foreground hover:text-destructive"
            loading={remove.isPending}
            onClick={onUnbind}
          >
            <Unlink className="mr-1.5 size-4" />
            {t('clickup.unbind')}
          </Button>
        )}
        <SaveButton onSave={onSave} disabled={!dirty || !listId || paused}>
          {data?.bound ? t('common.save') : t('clickup.bind')}
        </SaveButton>
      </div>
    );

  if (variant === 'plain') {
    return (
      <div className="space-y-5">
        {body}
        {actions && <div className="border-t pt-4">{actions}</div>}
      </div>
    );
  }

  return (
    <Card className={cn(paused && 'opacity-90')}>
      <CardHeader className="space-y-1.5">
        <CardTitle>{title ?? t('clickup.sync')}</CardTitle>
        <CardDescription>{t('clickup.syncHint')}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
      {actions && <CardFooter>{actions}</CardFooter>}
    </Card>
  );
}

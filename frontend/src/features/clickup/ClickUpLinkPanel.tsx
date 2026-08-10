import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Link2, Loader2, Plus, RefreshCw, Unlink, X } from 'lucide-react';
import { Button, Dialog, Field, Input, Menu } from '@/components/ui';
import { ClickUpIcon } from '@/components/ClickUpIcon';
import { PropSection } from '@/features/issues/IssueDetail';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { ClickUpLinkOrigin, ClickUpLinkTarget, ClickUpStatusType } from '@/types/enums';
import type { ClickUpLinkDto } from '@/types/dto';
import {
  useClickUpLinks,
  useClickUpPushTarget,
  useClickUpStatus,
  useLinkClickUpTask,
  usePushClickUpTask,
  useRefreshClickUpLink,
  useSetClickUpLinkDetached,
  useUnlinkClickUpTask,
} from './api';

/** ClickUp's own finished buckets — the only judgement we make about its status. */
const FINISHED: string[] = [ClickUpStatusType.DONE, ClickUpStatusType.CLOSED];

/**
 * The ClickUp panel on an issue or a backlog item's Properties sidebar.
 *
 * One component for both, because "a ClickUp task beside this record" is one
 * idea — only the two ids that identify the record differ.
 *
 * What it deliberately is **not**: a second status field. Everything shown here
 * is ClickUp's, mirrored, in ClickUp's own colours, and it never touches this
 * workspace's status. `lastSyncedAt` on each row is how "mirrored" stays an
 * honest claim rather than an implied live read.
 *
 * There are **two ways a link gets here**, and the panel offers whichever apply:
 *
 * - **Link an existing task** — paste a URL. Always available while ClickUp is
 *   connected. What it *means* depends on the board: a mirror on an unbound one,
 *   and on a bound one, adoption — the pasted task becomes this record's synced
 *   task, which is the honest answer for a team who made it in ClickUp first.
 * - **Create in ClickUp** — mint the task through this board's binding. Only
 *   where a binding exists and this record hasn't already got a task, which in
 *   practice means work that predates the binding: the automatic push runs on
 *   save, so a backlog nobody has touched since would otherwise never appear in
 *   ClickUp at all.
 *
 * When only the first applies — no bound board, the common case — the header
 * keeps its plain `+` and opens the paste dialog directly. A menu of one is a
 * click asking permission to do the only thing it could have done.
 *
 * And one way out that isn't unbinding the whole board: a synced row can be
 * **detached**, which stops both legs for this record alone.
 */
export function ClickUpLinkPanel({
  targetType,
  targetId,
  roadmapId,
  canWrite,
}: {
  targetType: ClickUpLinkTarget;
  targetId: string;
  /** Required for a backlog item — its roadmap. Omit for an issue. */
  roadmapId?: string;
  canWrite: boolean;
}) {
  const { data: status } = useClickUpStatus();
  const { data: links } = useClickUpLinks(targetType, targetId);
  const link = useLinkClickUpTask();
  const push = usePushClickUpTask();
  // Only asked once the workspace is known to be connected, and only for someone
  // who could act on the answer — most workspaces have no ClickUp at all, and
  // this would otherwise be a request per issue opened to be told "no".
  const { data: pushTarget } = useClickUpPushTarget(
    { targetType, targetId, roadmapId },
    canWrite && !!status?.available,
  );
  const [adding, setAdding] = useState(false);
  const [reference, setReference] = useState('');

  const rows = links ?? [];
  // Nothing connected and nothing linked → the panel doesn't exist. A workspace
  // that has never heard of ClickUp shouldn't carry an empty ClickUp box on
  // every issue. A *paused* connection still shows what's already linked.
  if (!status?.available && rows.length === 0) return null;

  function onPush() {
    push.mutate(
      { targetType, targetId, roadmapId },
      {
        // The list is named here rather than on the button: it's what the person
        // wants confirmed *after* the fact ("where did that go?"), and the menu
        // has no room for a list name that could be anything.
        onSuccess: () =>
          toast.success(t('clickup.created').replace('{list}', pushTarget?.listName ?? '')),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function onSubmit() {
    const value = reference.trim();
    if (!value) return toast.error(t('clickup.referenceRequired'));
    link.mutate(
      { reference: value, targetType, targetId, roadmapId },
      {
        onSuccess: () => {
          setAdding(false);
          setReference('');
          toast.success(t('clickup.linked'));
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <PropSection
      label={
        <span className="flex min-w-0 items-center gap-1.5">
          <ClickUpIcon className="size-3.5 shrink-0" />
          <span className="truncate">{t('clickup.title')}</span>
        </span>
      }
      trailing={
        canWrite && status?.available ? (
          pushTarget?.canPush ? (
            <Menu
              align="right"
              triggerClassName="size-6 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              trigger={
                <>
                  {push.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="size-4" aria-hidden />
                  )}
                  <span className="sr-only">{t('clickup.add')}</span>
                </>
              }
              items={[
                {
                  label: t('clickup.create'),
                  icon: <ClickUpIcon className="size-3.5" />,
                  onClick: onPush,
                  disabled: push.isPending,
                  closeOnSelect: true,
                },
                {
                  label: t('clickup.linkExisting'),
                  icon: <Link2 className="size-3.5" />,
                  onClick: () => setAdding(true),
                  closeOnSelect: true,
                },
              ]}
            />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground"
              onClick={() => setAdding(true)}
              aria-label={t('clickup.link')}
            >
              <Plus className="size-4" />
            </Button>
          )
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('clickup.none')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <ClickUpLinkRow
              key={row.id}
              row={row}
              targetType={targetType}
              targetId={targetId}
              canWrite={canWrite}
              boardBound={!!pushTarget?.bound}
            />
          ))}
        </div>
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title={t('clickup.link')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onSubmit} loading={link.isPending}>
              {t('clickup.link')}
            </Button>
          </>
        }
      >
        <Field label={t('clickup.reference')} htmlFor="clickup-reference">
          <Input
            id="clickup-reference"
            autoFocus
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            placeholder="https://app.clickup.com/t/86abc123"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{t('clickup.referenceHint')}</p>
        </Field>
        {/* Said once, here, at the moment the link is about to exist — because
            the same gesture means two different things and only the board knows
            which. `canPush` is exactly the adopting case: bound, syncing, and
            nothing synced on this record yet. */}
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {pushTarget?.canPush
            ? t('clickup.adoptNote').replace('{list}', pushTarget.listName)
            : t('clickup.oneWayNote')}
        </p>
      </Dialog>
    </PropSection>
  );
}

/**
 * One linked task. Sized for the 260px Properties sidebar, so the row is two
 * lines — name, then status and freshness — with the actions on hover.
 *
 * A row is in one of three states, and each offers a different way out:
 *
 * - **mirror** (`manual`) — nothing was ever written to it. `×` removes it.
 * - **syncing** (`sync`) — written to, and its status moves this item. `×` is not
 *   offered, because removing the only record of which ClickUp task this item
 *   owns is how the next save creates a *second* one. **Stop syncing** is offered
 *   instead: reversible, and it changes nothing in ClickUp.
 * - **detached** — was syncing, isn't now. An ordinary mirror again, so both
 *   **Resume** and `×` apply. The `×` warns when the board is still bound, since
 *   from there the next save does start a fresh task.
 */
function ClickUpLinkRow({
  row,
  targetType,
  targetId,
  canWrite,
  boardBound,
}: {
  row: ClickUpLinkDto;
  targetType: ClickUpLinkTarget;
  targetId: string;
  canWrite: boolean;
  /** Is this record's board still bound to a ClickUp list? Only affects wording. */
  boardBound: boolean;
}) {
  const refresh = useRefreshClickUpLink(targetType, targetId);
  const unlink = useUnlinkClickUpTask(targetType, targetId);
  const detach = useSetClickUpLinkDetached(targetType, targetId);
  const finished = FINISHED.includes(row.statusType);
  const broken = !!row.unavailableReason;
  // A link the board made or adopted, not a bare mirror.
  const synced = row.origin === ClickUpLinkOrigin.SYNC;
  const syncing = synced && !row.detached;
  const detached = synced && row.detached;

  function onSetDetached(next: boolean) {
    detach.mutate(
      { id: row.id, detached: next },
      {
        onSuccess: () => toast.success(t(next ? 'clickup.syncStopped' : 'clickup.syncResumed')),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function onRemove() {
    // The warning is the whole reason this confirms at all: everywhere else,
    // removing a link is inert. On a bound board, removing a *detached* one hands
    // the item back to the board, and the next save makes it a new ClickUp task.
    const message = detached && boardBound ? 'clickup.removeConfirmBound' : 'clickup.removeConfirm';
    if (!confirm(t(message))) return;
    unlink.mutate(row.id, { onError: (e) => toast.error((e as Error).message) });
  }

  return (
    <div
      className={cn(
        'group flex flex-col gap-1 rounded-md border border-border bg-background px-2 py-1.5',
        broken && 'border-dashed opacity-70',
      )}
    >
      <div className="flex items-start gap-1.5">
        <a
          href={row.taskUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 text-sm hover:underline"
          title={[row.spaceName, row.listName].filter(Boolean).join(' · ') || row.taskName}
        >
          {row.customId && (
            <span className="mr-1 font-mono text-[11px] text-muted-foreground">{row.customId}</span>
          )}
          <span className={cn('break-words', finished && 'line-through decoration-1')}>
            {row.taskName || row.clickupTaskId}
          </span>
        </a>
        {/* Hover-revealed, with a static fallback below `sm` where there is no
            hover to reveal them with. */}
        <div className="flex shrink-0 items-center opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
          <a
            href={row.taskUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('clickup.open')}
          >
            <ExternalLink className="size-3.5" />
          </a>
          {canWrite && (
            <>
              <button
                type="button"
                onClick={() =>
                  refresh.mutate(row.id, { onError: (e) => toast.error((e as Error).message) })
                }
                disabled={refresh.isPending}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label={t('clickup.refresh')}
              >
                <RefreshCw className={cn('size-3.5', refresh.isPending && 'animate-spin')} />
              </button>
              {syncing && (
                <button
                  type="button"
                  onClick={() => onSetDetached(true)}
                  disabled={detach.isPending}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label={t('clickup.stopSync')}
                  title={t('clickup.stopSync')}
                >
                  <Unlink className="size-3.5" />
                </button>
              )}
              {detached && (
                <button
                  type="button"
                  onClick={() => onSetDetached(false)}
                  disabled={detach.isPending}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label={t('clickup.resumeSync')}
                  title={t('clickup.resumeSync')}
                >
                  <Link2 className="size-3.5" />
                </button>
              )}
              {!syncing && (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={unlink.isPending}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                  aria-label={t('clickup.unlink')}
                  title={t('clickup.unlink')}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
        {broken ? (
          <span className="truncate text-muted-foreground">{row.unavailableReason}</span>
        ) : (
          <>
            {/* ClickUp's colour, not ours — this dot is a quotation. Everything
                branded on this row (the buttons) stays on our palette. */}
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.statusColor || 'currentColor' }}
            />
            <span className="min-w-0 truncate font-medium" style={{ color: row.statusColor }}>
              {row.status || '—'}
            </span>
            <span
              className="shrink-0 text-muted-foreground"
              title={`${t('clickup.lastSynced')} ${timeAgo(row.lastSyncedAt)}`}
            >
              · {timeAgo(row.lastSyncedAt)}
            </span>
            {/* Two chips, never both. "Sync off" is not a warning — it's the
                state someone asked for — so it stays on the same muted chip and
                only the border says it's the other one. */}
            {syncing && (
              <span
                className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title={t('clickup.syncedNote')}
              >
                {t('clickup.synced')}
              </span>
            )}
            {detached && (
              <span
                className="shrink-0 rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title={t('clickup.syncOffNote')}
              >
                {t('clickup.syncOff')}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Plus, RefreshCw, X } from 'lucide-react';
import { Button, Dialog, Field, Input } from '@/components/ui';
import { ClickUpIcon } from '@/components/ClickUpIcon';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { ClickUpLinkTarget, ClickUpStatusType } from '@/types/enums';
import type { ClickUpLinkDto } from '@/types/dto';
import {
  useClickUpLinks,
  useClickUpStatus,
  useLinkClickUpTask,
  useRefreshClickUpLink,
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
  const [adding, setAdding] = useState(false);
  const [reference, setReference] = useState('');

  const rows = links ?? [];
  // Nothing connected and nothing linked → the panel doesn't exist. A workspace
  // that has never heard of ClickUp shouldn't carry an empty ClickUp box on
  // every issue. A *paused* connection still shows what's already linked.
  if (!status?.available && rows.length === 0) return null;

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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <ClickUpIcon className="size-3.5 shrink-0" />
          <span className="truncate">{t('clickup.title')}</span>
        </span>
        {canWrite && status?.available && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground"
            onClick={() => setAdding(true)}
            aria-label={t('clickup.link')}
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('clickup.none')}</p>
      ) : (
        rows.map((row) => (
          <ClickUpLinkRow
            key={row.id}
            row={row}
            targetType={targetType}
            targetId={targetId}
            canWrite={canWrite}
          />
        ))
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
        {/* Said once, here, where someone is about to create the link and could
            otherwise reasonably expect it to sync both ways. */}
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {t('clickup.oneWayNote')}
        </p>
      </Dialog>
    </div>
  );
}

/**
 * One linked task. Sized for the 260px Properties sidebar, so the row is two
 * lines — name, then status and freshness — with the actions on hover.
 */
function ClickUpLinkRow({
  row,
  targetType,
  targetId,
  canWrite,
}: {
  row: ClickUpLinkDto;
  targetType: ClickUpLinkTarget;
  targetId: string;
  canWrite: boolean;
}) {
  const refresh = useRefreshClickUpLink(targetType, targetId);
  const unlink = useUnlinkClickUpTask(targetType, targetId);
  const finished = FINISHED.includes(row.statusType);
  const broken = !!row.unavailableReason;

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
              <button
                type="button"
                onClick={() =>
                  unlink.mutate(row.id, { onError: (e) => toast.error((e as Error).message) })
                }
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                aria-label={t('clickup.unlink')}
              >
                <X className="size-3.5" />
              </button>
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
          </>
        )}
      </div>
    </div>
  );
}

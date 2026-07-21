import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, Inbox as InboxIcon } from 'lucide-react';
import { Badge, Button, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { INBOX_KIND_LABEL, InboxKind } from '@/types/enums';
import { BugDetail } from '@/features/bugs/components/BugDetail';
import { useInbox, useMarkInboxItemRead, useMarkInboxSeen } from './api';
import type { InboxItemDto } from '@/types/dto';
import { FullWidthPageLayout } from '@/layouts/shared';

/**
 * Two-pane inbox (Linear-style): a notification list on the left, the selected
 * item's detail in the main pane. Every inbox item references a bug, so the main
 * pane renders the shared <BugDetail>. Full-height; on mobile the list and the
 * detail swap (tap a row → detail, back arrow → list).
 */
export function InboxPage() {
  const { data, isLoading } = useInbox();
  const markSeen = useMarkInboxSeen();
  const markItemRead = useMarkInboxItemRead();
  const [params, setParams] = useSearchParams();

  const items = data?.items ?? [];
  // `?item=` = an explicit tap (drives mobile). Desktop falls back to the first.
  const tapped = params.get('item');
  const selected = items.find((i) => i.refId === tapped) ?? items[0];

  // Open a notification: focus it in the detail pane and mark just this one read.
  function openItem(item: InboxItemDto) {
    const next = new URLSearchParams(params);
    next.set('item', item.refId);
    setParams(next, { replace: true });
    if (!item.seen) markItemRead.mutate(item.key);
  }
  function clearSelection() {
    const next = new URLSearchParams(params);
    next.delete('item');
    setParams(next, { replace: true });
  }

  return (
    <FullWidthPageLayout fullHeight>
      <PageHeader
        title={t('inbox.title')}
        actions={
          items.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => markSeen.mutate()}>
              {t('inbox.markSeen')}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('inbox.empty')}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 sm:overflow-hidden">
          {/* Left: notification list */}
          <div
            className={cn(
              'flex min-h-0 w-full flex-col overflow-y-auto rounded-xl border bg-card text-card-foreground shadow-sm md:w-[360px] md:shrink-0',
              tapped && 'hidden md:flex',
            )}
          >
            {items.map((item) => {
              const active = selected && item.refId === selected.refId;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => openItem(item)}
                  className={cn(
                    'flex items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent',
                    active && 'bg-accent',
                  )}
                >
                  <span
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                    aria-hidden
                  >
                    {(item.actorName || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <Badge
                        variant={item.kind === InboxKind.MENTION ? 'info' : 'muted'}
                        className="shrink-0"
                      >
                        {INBOX_KIND_LABEL[item.kind]}
                      </Badge>
                      {!item.seen && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {timeAgo(item.createdAt)}
                      </span>
                    </span>
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.actorName}{' '}
                      {item.kind === InboxKind.MENTION
                        ? t('inbox.mentionedYou')
                        : t('inbox.assignedYou')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: the selected item's detail */}
          <div
            className={cn(
              'min-h-0 w-full flex-1 overflow-y-auto md:block',
              !tapped && 'hidden md:block',
            )}
          >
            {selected ? (
              <>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:hidden"
                >
                  <ChevronLeft className="size-4" />
                  {t('inbox.title')}
                </button>
                <BugDetail bugId={selected.refId} onDeleted={clearSelection} />
              </>
            ) : (
              <div className="hidden h-full place-items-center text-center text-muted-foreground md:grid">
                <div className="flex flex-col items-center gap-2">
                  <InboxIcon className="size-8 opacity-40" aria-hidden />
                  <p className="text-sm">{t('inbox.selectPrompt')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </FullWidthPageLayout>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/components/PageHeader';
import { timeAgo } from '@/lib/format';
import { INBOX_KIND_LABEL, InboxKind } from '@/types/enums';
import { cn } from '@/lib/utils';
import { useInbox, useMarkInboxSeen } from './api';

export function InboxPage() {
  const { data, isLoading } = useInbox();
  const markSeen = useMarkInboxSeen();
  const [tab, setTab] = useState<'all' | InboxKind>('all');

  // Mark everything read when the inbox is opened.
  useEffect(() => {
    if (data && data.unseenCount > 0) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.unseenCount]);

  const allItems = data?.items ?? [];
  const items = tab === 'all' ? allItems : allItems.filter((i) => i.kind === tab);

  const tabs: { key: 'all' | InboxKind; label: string }[] = [
    { key: 'all', label: t('inbox.tabAll') },
    { key: InboxKind.MENTION, label: t('inbox.tabMentions') },
    { key: InboxKind.ASSIGNED_BUG, label: t('inbox.tabAssigned') },
  ];

  return (
    <div>
      <PageHeader
        title={t('inbox.title')}
        actions={
          allItems.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => markSeen.mutate()}>
              {t('inbox.markSeen')}
            </Button>
          ) : undefined
        }
      />

      {allItems.length > 0 && (
        <div className="mb-4 inline-flex rounded-md border p-0.5">
          {tabs.map(({ key, label }) => {
            const count = key === 'all' ? allItems.length : allItems.filter((i) => i.kind === key).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'rounded px-3 py-1 text-sm transition-colors',
                  tab === key
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label} <span className="text-xs text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('inbox.empty')}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
          {items.map((item) => (
            <Link
              key={`${item.kind}-${item.id}`}
              to={`/bugs/${item.refId}`}
              className={cn(
                'flex items-center gap-3 rounded-md px-4 py-3 text-foreground transition-colors hover:bg-accent [&:not(:last-child)]:border-b',
                !item.seen && 'bg-muted/50',
              )}
            >
              <Badge
                variant={item.kind === InboxKind.MENTION ? 'info' : 'muted'}
                className="shrink-0"
              >
                {INBOX_KIND_LABEL[item.kind]}
              </Badge>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">
                  {item.actorName}{' '}
                  {item.kind === InboxKind.MENTION ? t('inbox.mentionedYou') : t('inbox.assignedYou')} ·{' '}
                  {timeAgo(item.createdAt)}
                </span>
              </div>
              {!item.seen && <span className="size-2 shrink-0 rounded-full bg-primary" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

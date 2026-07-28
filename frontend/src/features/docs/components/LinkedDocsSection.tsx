import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { TeamSymbol } from '@/components/TeamSymbol';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { useLinkedDocs } from '../api';

interface LinkedDocsSectionProps {
  /** The issue / roadmap item this record is. */
  refId: string | undefined;
  className?: string;
}

/**
 * The doc pages attached to this record — the other end of a page's "Link Task
 * or Doc". Renders nothing when there are none: a record with no docs shouldn't
 * grow an empty section on every detail page in the app.
 */
export function LinkedDocsSection({ refId, className }: LinkedDocsSectionProps) {
  const { data } = useLinkedDocs(refId);
  const pages = data ?? [];
  if (pages.length === 0) return null;

  return (
    <section className={cn('flex flex-col gap-2', className)}>
      {/* Same eyebrow heading as the neighbouring SUB-TASKS section on a detail page. */}
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <FileText className="size-3.5" aria-hidden />
        {t('docs.linkedDocs')}
        <span className="tabular-nums">({pages.length})</span>
      </h3>
      <ul className="flex flex-col gap-1.5">
        {pages.map((p) => (
          <li key={p.pageId}>
            <Link
              to={`/docs/${p.docId}/${p.pageId}`}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 transition-colors hover:border-primary hover:bg-accent"
            >
              <TeamSymbol
                name={p.pageIcon || 'book'}
                size={14}
                className="text-muted-foreground"
                color={p.pageColor ?? undefined}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {p.pageTitle || t('docs.untitled')}
              </span>
              <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground sm:inline">
                {p.docTitle}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {timeAgo(p.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

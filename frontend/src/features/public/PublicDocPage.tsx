import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import { DetailSkeleton } from '@/components/Skeletons';
import { RichText } from '@/components/ui';
import { TeamSymbol } from '@/components/TeamSymbol';
import { DocAttachments } from '@/features/docs/components/DocAttachments';
import { pageStyleOf, typographyAttrs, widthClass } from '@/features/docs/pageStyle';
import { pageFromSlug, pageSlug } from '@/features/docs/slug';
import { buildDocTree, visibleRows } from '@/features/docs/tree';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { usePublicDoc } from './api';
import { PublicShell } from './PublicShell';

/** Which page is open, kept in the query string so the link can be shared. */
const PAGE_PARAM = 'page';

/**
 * A doc shared read-only. Same two-pane shape as the authenticated workspace —
 * page rail on the left, the page on the right — minus every editing affordance.
 * The payload carries all bodies, so switching pages is instant and offline-safe.
 *
 * The open page lives in `?page=` rather than in component state: a reader who
 * clicks through to something worth sending can copy the URL out of the address
 * bar and it opens there, and Back walks the pages they came through.
 */
export function PublicDocPage() {
  const { token } = useParams<{ token: string }>();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError } = usePublicDoc(token);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const body = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => visibleRows(buildDocTree(data?.doc.pages ?? []), collapsed),
    [data, collapsed],
  );

  // The page named in the URL, else the first in the rail — a bare share link
  // opens on page one, a deep link opens where it points.
  const slug = params.get(PAGE_PARAM) ?? '';
  const page = useMemo(() => {
    const pages = data?.pages ?? [];
    return (
      pageFromSlug(pages, slug) ?? pages.find((p) => p.id === rows[0]?.page.id) ?? pages[0]
    );
  }, [data, slug, rows]);

  /** Open a page: the URL changes, and the view follows from it. */
  function openPage(target: { id: string; title: string }) {
    // Merge rather than replace so anything else on the link survives.
    const next = new URLSearchParams(params);
    next.set(PAGE_PARAM, pageSlug(target));
    setParams(next);
  }

  // A new page starts at its top, not wherever the last one was left scrolled.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [page?.id]);

  if (isLoading) {
    return (
      <PublicShell>
        <div className="p-6">
          <DetailSkeleton />
        </div>
      </PublicShell>
    );
  }

  if (isError || !data) {
    return (
      <PublicShell>
        <p className="p-10 text-center text-sm text-muted-foreground">
          {t('public.notAvailable')}
        </p>
      </PublicShell>
    );
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Whatever the author set on *this* page. `showLinks` has no bearing here —
  // the shared payload carries no records to link to.
  const style = pageStyleOf(page);
  const typo = typographyAttrs(style);

  return (
    <PublicShell title={data.doc.title}>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b bg-muted/20 p-2 md:w-64 md:border-b-0 md:border-r">
          <nav aria-label={t('docs.pagesLabel')} className="max-h-52 overflow-y-auto md:max-h-none">
            <ul className="flex flex-col">
              {rows.map(({ page: p, depth, children }) => (
                <li key={p.id}>
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-md',
                      p.id === page?.id ? 'bg-accent' : 'hover:bg-accent/60',
                    )}
                    style={{ paddingLeft: depth * 12 }}
                  >
                    <button
                      type="button"
                      aria-label={p.title}
                      onClick={() => children.length && toggle(p.id)}
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground',
                        children.length ? 'hover:bg-muted' : 'invisible',
                      )}
                      tabIndex={children.length ? 0 : -1}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 transition-transform',
                          !collapsed.has(p.id) && 'rotate-90',
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => openPage(p)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left"
                    >
                      {p.icon ? (
                        <TeamSymbol
                          name={p.icon}
                          size={14}
                          className="text-muted-foreground"
                          color={p.color ?? undefined}
                        />
                      ) : (
                        <FileText
                          className="size-3.5 shrink-0 text-muted-foreground"
                          style={p.color ? { color: p.color } : undefined}
                          aria-hidden
                        />
                      )}
                      <span className="min-w-0 truncate text-[13px]">
                        {p.title || t('docs.untitled')}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div ref={body} className="min-w-0 flex-1 overflow-y-auto">
          {page?.coverUrl && style.showCover && (
            <div className="h-32 w-full overflow-hidden bg-muted sm:h-44">
              <img src={page.coverUrl} alt="" className="size-full object-cover" />
            </div>
          )}
          {/* Page Styles are how the author set this page, so they hold here too
              — a shared link should look like what they were looking at. */}
          <article
            {...typo}
            className={cn(
              typo.className,
              'mx-auto w-full px-4 pb-16 pt-6 sm:px-8',
              widthClass(style.pageWidth),
            )}
          >
            {style.showTitle && (
              <>
                <TeamSymbol
                  name={page?.icon || 'book'}
                  size={26}
                  className="mb-3 text-muted-foreground"
                  color={page?.color ?? undefined}
                />
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {page?.title || t('docs.untitled')}
                </h1>
              </>
            )}
            {style.showUpdated && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('docs.updatedBy')
                  .replace('{name}', page?.updatedByName || '—')
                  .replace('{when}', page ? timeAgo(page.updatedAt) : '')}
              </p>
            )}
            {/* Files travel with the shared payload, so a reader gets the deck
                and the spec without an account — same row as the workspace,
                minus every way to change it. */}
            {style.showAttachments && (
              <DocAttachments
                items={page?.attachments ?? []}
                canWrite={false}
                className="mt-4 border-y py-2.5"
              />
            )}
            <RichText html={page?.content ?? ''} className="mt-6" />
          </article>
        </div>
      </div>
    </PublicShell>
  );
}

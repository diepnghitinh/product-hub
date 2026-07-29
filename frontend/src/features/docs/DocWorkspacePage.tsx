import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  FileDown,
  FileText,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Share2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { Button, Drawer, Menu, type MenuItem } from '@/components/ui';
import { DetailSkeleton } from '@/components/Skeletons';
import { ShareLinkDialog } from '@/components/ShareLinkDialog';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { FullScreenLayout } from '@/layouts/shared';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { FavouriteKind } from '@/types/enums';
import { FavouriteButton } from '@/features/favourites/FavouriteButton';
import type { DocPageSummary } from '@/types/dto';
import {
  useCreateDocPage,
  useDeleteDoc,
  useDeleteDocPage,
  useDoc,
  useDocCommentCounts,
  useDocPage,
  useExportDocPagePdf,
  useReorderDocPages,
  useSetDocSharing,
  useUpdateDoc,
  useUpdateDocPage,
} from './api';
import { DocPageTree } from './components/DocPageTree';
import { DocPageEditor } from './components/DocPageEditor';
import { DocTagsBar } from './components/DocTagsBar';
import { docKey, docPath, pageFromSlug } from './slug';

/**
 * A doc: its pages in a left rail, the selected page on the right. The rail
 * collapses on desktop and becomes a drawer under `md` — on a phone the editor
 * needs the whole width, and a permanently docked rail would leave it a sliver.
 *
 * The selected page lives in the URL (`/docs/DOC-6HCUHKX/getting-started-622436d1`),
 * so a page is linkable and the browser's back button walks the pages you read.
 * Neither half is a uuid — see `slug.ts`.
 */
export function DocWorkspacePage() {
  /**
   * Both halves of the URL are handles, not ids: `/docs/DOC-6HCUHKX/getting-started-622436d1`.
   * They only ever address — every request below keys off the doc's real uuid,
   * which arrives with the doc itself.
   */
  const { docId: docKeyParam, pageId: pageKeyParam } = useParams<{
    docId: string;
    pageId?: string;
  }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canWrite, canManageDelivery, canEditDelivery: canComment } = useAuth();

  // Resolved server-side from either form — a `DOC-…` ref or, for links sent
  // before refs existed, the uuid.
  const { data: doc, isLoading, isError } = useDoc(docKeyParam);
  const docId = doc?.id;
  const pages = useMemo(() => doc?.pages ?? [], [doc]);
  // Open-thread counts for every page at once, so the rail can badge them
  // without a request per row.
  const { data: commentCounts } = useDocCommentCounts(canComment ? docId : undefined);
  const openByPage = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of commentCounts ?? []) map[row.pageId] = row.openCount;
    return map;
  }, [commentCounts]);

  /**
   * The page the URL points at — by slug (`getting-started-622436d1`), or by raw
   * uuid for an older link. No page in the URL, or one that no longer exists?
   * Land on the first: a doc always has at least one.
   */
  const activePage = useMemo(() => {
    if (!pageKeyParam) return pages[0];
    return (
      pages.find((p) => p.id === pageKeyParam) ?? pageFromSlug(pages, pageKeyParam) ?? pages[0]
    );
  }, [pages, pageKeyParam]);
  const activeId = activePage?.id;

  /**
   * Rewrite whatever form the link arrived in to the canonical one, so the
   * address bar is always shareable. Deliberately compares what the URL
   * *resolves to*, not how it's spelled — a slug carries the title's words, and
   * re-pushing history on every keystroke of a rename would be pure churn (the
   * trailing id is what resolves it, so the stale words still land). The query
   * string rides along — a mention deep-link is `…?comment=<id>`, and rewriting
   * the path shouldn't be what loses it.
   */
  useEffect(() => {
    if (!doc || !activePage) return;
    const resolved =
      docKeyParam === docKey(doc) &&
      !!pageKeyParam &&
      (pageKeyParam === activePage.id || pageFromSlug(pages, pageKeyParam)?.id === activePage.id);
    if (resolved) return;
    const search = params.toString();
    navigate(`${docPath(doc, activePage)}${search ? `?${search}` : ''}`, { replace: true });
  }, [doc, activePage, pages, docKeyParam, pageKeyParam, params, navigate]);

  const { data: page, isLoading: pageLoading } = useDocPage(docId, activeId);

  const createPage = useCreateDocPage();
  const deletePage = useDeleteDocPage();
  const renamePage = useUpdateDocPage();
  const reorder = useReorderDocPages();
  const updateDoc = useUpdateDoc();
  const deleteDoc = useDeleteDoc();
  const setSharing = useSetDocSharing();
  const exportPdf = useExportDocPagePdf();

  const [railOpen, setRailOpen] = useState(true);
  const [mobileRail, setMobileRail] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  /**
   * A mention links to `…/:pageId?comment=<id>`. Held in state rather than read
   * from the URL each render: the page body loads a beat after the workspace, so
   * the editor mounts *after* the parameter would have been cleared — and it's
   * cleared on purpose, or closing the rail would reopen it on the next render.
   */
  const [focusComment, setFocusComment] = useState<string | null>(() => params.get('comment'));
  const [commentsOpen, setCommentsOpen] = useState(!!focusComment);
  useEffect(() => {
    if (!params.get('comment')) return;
    const next = new URLSearchParams(params);
    next.delete('comment');
    setParams(next, { replace: true });
  }, [params, setParams]);

  if (isLoading) {
    return (
      <FullScreenLayout className="p-6">
        <DetailSkeleton />
      </FullScreenLayout>
    );
  }

  if (isError || !doc || !docId) {
    return (
      <FullScreenLayout className="p-6">
        <p className="text-sm text-muted-foreground">{t('docs.notFound')}</p>
      </FullScreenLayout>
    );
  }

  // `doc` is non-null from here down, so the URL builders below always have a
  // ref to work with — no path is ever assembled from a bare uuid.
  const openPage = (target: DocPageSummary) => {
    setMobileRail(false);
    // The thread we were sent to lives on the page we're leaving.
    setFocusComment(null);
    navigate(docPath(doc, target));
  };

  // Arrow consts, not `function` declarations: a hoisted function can't see the
  // `!doc || !docId` guard above it, so `docId` would read as possibly undefined.
  const addPage = (parentId: string) => {
    createPage.mutate(
      { docId, input: { parentId, title: t('docs.newPage') } },
      { onSuccess: (created) => openPage(created) },
    );
  };

  const removePage = (target: DocPageSummary) => {
    if (!confirm(t('docs.confirmDeletePage'))) return;
    deletePage.mutate(
      { docId, pageId: target.id },
      {
        onSuccess: (res) => {
          // Deleting what you're reading (or an ancestor of it) has to move you
          // somewhere — the first page that survived.
          if (activeId && res.deletedIds.includes(activeId)) {
            const left = pages.find((p) => !res.deletedIds.includes(p.id));
            navigate(left ? docPath(doc, left) : docPath(doc), { replace: true });
          }
        },
      },
    );
  };

  // Page Styles used to open from here. It now rides the page heading next to
  // "Add cover" — the page's look is edited where the page is, and this menu is
  // left holding only what acts on the whole doc, plus exporting the page you're
  // reading, which is where everyone looks for it.
  const docMenu: MenuItem[] = [
    // Ungated on purpose: taking away a copy of what you're already allowed to
    // read isn't a permission, and this menu no longer appears only to admins.
    {
      label: exportPdf.isPending ? t('docs.exportingPdf') : t('docs.exportPdf'),
      icon: <FileDown className="size-4" />,
      disabled: exportPdf.isPending || !activePage,
      onClick: () => {
        if (!activePage) return;
        exportPdf
          .mutateAsync({ docId, pageId: activePage.id, title: activePage.title })
          .catch((e) => toast.error((e as Error).message));
      },
    },
    ...(canManageDelivery
      ? [
          {
            label: t('docs.share'),
            icon: <Share2 className="size-4" />,
            closeOnSelect: true,
            onClick: () => setShareOpen(true),
          },
          {
            label: t('docs.delete'),
            icon: <Trash2 className="size-4" />,
            danger: true,
            onClick: () => {
              if (confirm(t('docs.confirmDelete')))
                deleteDoc.mutate(docId, { onSuccess: () => navigate('/docs') });
            },
          },
        ]
      : []),
  ];

  /** `trailing` is the desktop collapse button, which sits on the tags row. The
   *  mobile drawer passes nothing — it closes itself, and a "collapse the rail"
   *  control inside a drawer would mean nothing. */
  const rail = (trailing?: ReactNode) => (
    <>
      {/* The doc's tags, above its pages — both travel together into the mobile
          drawer, so the rail stays the one place a doc describes itself. */}
      <div className="flex items-start gap-1 pr-2">
        <div className="min-w-0 flex-1">
          <DocTagsBar
            tags={doc.tags}
            canWrite={canWrite}
            saving={updateDoc.isPending}
            onSave={(tags) => updateDoc.mutateAsync({ id: doc.id, input: { tags } })}
          />
        </div>
        {trailing}
      </div>
      <DocPageTree
        pages={pages}
        activeId={activeId}
        onSelect={(id) => {
          const target = pages.find((p) => p.id === id);
          if (target) openPage(target);
        }}
        canWrite={canWrite}
        openComments={openByPage}
        onAdd={addPage}
        onRename={(p, title) => renamePage.mutate({ docId, pageId: p.id, input: { title } })}
        onDelete={removePage}
        onMove={(next, moved) => reorder.mutate({ docId, pages: moved, next })}
      />
    </>
  );

  return (
    <FullScreenLayout>
      {/* No `parent` — /docs is a nav item, so the shell already puts "Docs" in
          front of the title; passing it again would print the crumb twice. */}
      <PageHeader
        title={doc.title}
        onTitleChange={
          canWrite ? (title) => updateDoc.mutate({ id: doc.id, input: { title } }) : undefined
        }
        titleLabel={t('docs.docTitle')}
        actions={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-[30px] md:hidden"
              aria-label={t('docs.pagesLabel')}
              onClick={() => setMobileRail(true)}
            >
              <PanelLeftOpen className="size-4" />
            </Button>
            {/* Pins the doc — the container, not the page you're on. Sized to the
                neighbouring header buttons rather than the button's own default,
                which is built for the roomier issue title row. */}
            <FavouriteButton
              kind={FavouriteKind.DOC}
              refId={doc.id}
              title={doc.title}
              size={16}
              className="size-[30px]"
            />
            {canComment && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('relative size-[30px]', commentsOpen && 'bg-accent text-foreground')}
                aria-label={t('docs.comments.title')}
                title={t('docs.comments.title')}
                aria-pressed={commentsOpen}
                onClick={() => setCommentsOpen((v) => !v)}
              >
                <MessageSquare className="size-4" />
                {/* The count is this page's open threads — the badge is about
                    what you're reading, not the whole doc. */}
                {(openByPage[activeId ?? ''] ?? 0) > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
                    {openByPage[activeId ?? '']}
                  </span>
                )}
              </Button>
            )}
            {docMenu.length > 0 && (
              <Menu
                align="right"
                items={docMenu}
                triggerClassName="grid size-[30px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                trigger={
                  <>
                    <MoreHorizontal className="size-4" aria-hidden />
                    <span className="sr-only">{t('common.more')}</span>
                  </>
                }
              />
            )}
          </div>
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex w-64 shrink-0 flex-col border-r bg-muted/20 pt-3 max-md:hidden',
            !railOpen && 'hidden',
          )}
        >
          {rail(
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-[30px] shrink-0 text-muted-foreground"
              aria-label={t('docs.collapseRail')}
              title={t('docs.collapseRail')}
              onClick={() => setRailOpen(false)}
            >
              <PanelLeftClose className="size-4" />
            </Button>,
          )}
        </aside>

        {/* Hidden rail: one pill in a slim gutter, holding the way back and the
            page count — the rail doesn't vanish, it folds down to "11 pages".
            No border or fill: a full-height stub read as an empty wall beside
            the page, and there's nothing in it to wall off. Both buttons stay
            on the left edge, where the pages are — from the topbar "Show pages"
            read as an action on the doc rather than on the rail. */}
        {!railOpen && (
          <div className="shrink-0 pl-2 pr-1 pt-3 max-md:hidden">
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1.5 rounded-lg px-2 text-muted-foreground hover:text-foreground"
              aria-label={t('docs.expandRail')}
              title={t('docs.expandRail')}
              onClick={() => setRailOpen(true)}
            >
              <FileText className="size-4" aria-hidden />
              <span className="text-xs font-medium tabular-nums">{pages.length}</span>
            </Button>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {pageLoading || !page ? (
            <div className="p-6">
              <DetailSkeleton />
            </div>
          ) : (
            // Keyed by page id: Editor.js reads its content once, at mount.
            <DocPageEditor
              key={page.id}
              page={page}
              canWrite={canWrite}
              commentsOpen={canComment && commentsOpen}
              onCommentsOpenChange={setCommentsOpen}
              focusCommentId={focusComment}
            />
          )}
        </div>
      </div>

      <Drawer
        open={mobileRail}
        onClose={() => setMobileRail(false)}
        title={t('docs.pagesLabel')}
        // Drawer's own title is sr-only ("the body carries the heading"), and the
        // rail has no heading of its own — so put a visible one in the header row.
        headerActions={<span className="px-1 text-sm font-medium">{t('docs.pagesLabel')}</span>}
      >
        <div className="-mx-4 flex h-full flex-col">{rail()}</div>
      </Drawer>

      {canManageDelivery && (
        <ShareLinkDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={t('docs.share')}
          hint={t('docs.shareHint')}
          publicPath="docs"
          enabled={doc.publicEnabled}
          publicToken={doc.publicToken}
          pending={setSharing.isPending}
          onToggle={(enabled) => setSharing.mutate({ id: doc.id, enabled })}
        />
      )}
    </FullScreenLayout>
  );
}

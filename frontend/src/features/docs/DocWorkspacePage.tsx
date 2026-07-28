import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MoreHorizontal,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  Share2,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, Drawer, Menu, type MenuItem } from '@/components/ui';
import { DetailSkeleton } from '@/components/Skeletons';
import { ShareLinkDialog } from '@/components/ShareLinkDialog';
import { TeamSymbol } from '@/components/TeamSymbol';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { FullScreenLayout } from '@/layouts/shared';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import type { DocPageSummary } from '@/types/dto';
import {
  useCreateDocPage,
  useDeleteDoc,
  useDeleteDocPage,
  useDoc,
  useDocPage,
  useReorderDocPages,
  useSetDocSharing,
  useUpdateDoc,
  useUpdateDocPage,
} from './api';
import { DocPageTree } from './components/DocPageTree';
import { DocPageEditor } from './components/DocPageEditor';
import { DocTagsBar } from './components/DocTagsBar';

/**
 * A doc: its pages in a left rail, the selected page on the right. The rail
 * collapses on desktop and becomes a drawer under `md` — on a phone the editor
 * needs the whole width, and a permanently docked rail would leave it a sliver.
 *
 * The selected page lives in the URL (`/docs/:docId/:pageId`), so a page is
 * linkable and the browser's back button walks the pages you read.
 */
export function DocWorkspacePage() {
  const { docId, pageId } = useParams<{ docId: string; pageId?: string }>();
  const navigate = useNavigate();
  const { canWrite, canManageDelivery } = useAuth();

  const { data: doc, isLoading, isError } = useDoc(docId);
  const pages = useMemo(() => doc?.pages ?? [], [doc]);

  // No page in the URL? Land on the first one — a doc always has at least one.
  const activeId = pageId && pages.some((p) => p.id === pageId) ? pageId : pages[0]?.id;
  useEffect(() => {
    if (docId && activeId && activeId !== pageId) {
      navigate(`/docs/${docId}/${activeId}`, { replace: true });
    }
  }, [docId, activeId, pageId, navigate]);

  const { data: page, isLoading: pageLoading } = useDocPage(docId, activeId);

  const createPage = useCreateDocPage();
  const deletePage = useDeleteDocPage();
  const renamePage = useUpdateDocPage();
  const reorder = useReorderDocPages();
  const updateDoc = useUpdateDoc();
  const deleteDoc = useDeleteDoc();
  const setSharing = useSetDocSharing();

  const [railOpen, setRailOpen] = useState(true);
  const [mobileRail, setMobileRail] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Opened from the ⋯ menu up here, but owned by the editor below — the style
  // belongs to the page it's editing, not to the workspace around it.
  const [stylesOpen, setStylesOpen] = useState(false);

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

  function openPage(id: string) {
    setMobileRail(false);
    navigate(`/docs/${docId}/${id}`);
  }

  function addPage(parentId: string) {
    createPage.mutate(
      { docId: docId as string, input: { parentId, title: t('docs.newPage') } },
      { onSuccess: (created) => openPage(created.id) },
    );
  }

  function removePage(target: DocPageSummary) {
    if (!confirm(t('docs.confirmDeletePage'))) return;
    deletePage.mutate(
      { docId: docId as string, pageId: target.id },
      {
        onSuccess: (res) => {
          // Deleting what you're reading (or an ancestor of it) has to move you
          // somewhere — the first page that survived.
          if (activeId && res.deletedIds.includes(activeId)) {
            const left = pages.find((p) => !res.deletedIds.includes(p.id));
            navigate(left ? `/docs/${docId}/${left.id}` : `/docs/${docId}`, { replace: true });
          }
        },
      },
    );
  }

  const docMenu: MenuItem[] = [
    // Page-scoped, so it needs only write rights — unlike sharing or deleting
    // the whole doc below it.
    ...(canWrite
      ? [
          {
            label: t('docs.pageStyles'),
            icon: <Paintbrush className="size-4" />,
            closeOnSelect: true,
            onClick: () => setStylesOpen(true),
          },
        ]
      : []),
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
                deleteDoc.mutate(docId as string, { onSuccess: () => navigate('/docs') });
            },
          },
        ]
      : []),
  ];

  const rail = (
    <>
      {/* The doc's tags, above its pages — both travel together into the mobile
          drawer, so the rail stays the one place a doc describes itself. */}
      <DocTagsBar
        tags={doc.tags}
        canWrite={canWrite}
        saving={updateDoc.isPending}
        onSave={(tags) => updateDoc.mutateAsync({ id: doc.id, input: { tags } })}
      />
      <DocPageTree
        pages={pages}
        activeId={activeId}
        onSelect={openPage}
        canWrite={canWrite}
        onAdd={addPage}
        onRename={(p, title) =>
          renamePage.mutate({ docId: docId as string, pageId: p.id, input: { title } })
        }
        onDelete={removePage}
        onMove={(next, moved) =>
          reorder.mutate({ docId: docId as string, pages: moved, next })
        }
      />
    </>
  );

  return (
    <FullScreenLayout>
      {/* No `parent` — /docs is a nav item, so the shell already puts "Docs" in
          front of the title; passing it again would print the crumb twice. */}
      <PageHeader
        title={doc.title}
        leading={
          <TeamSymbol
            name={doc.icon || 'book'}
            size={15}
            className="text-muted-foreground"
            color={doc.color ?? undefined}
          />
        }
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-[30px] max-md:hidden"
              aria-label={railOpen ? t('docs.collapseRail') : t('docs.expandRail')}
              title={railOpen ? t('docs.collapseRail') : t('docs.expandRail')}
              onClick={() => setRailOpen((v) => !v)}
            >
              {railOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </Button>
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
          {rail}
        </aside>

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
              stylesOpen={stylesOpen}
              onStylesClose={() => setStylesOpen(false)}
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
        <div className="-mx-4 flex h-full flex-col">{rail}</div>
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

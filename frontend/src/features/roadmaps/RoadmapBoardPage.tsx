import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Menu, ProgressBar, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import {
  KanbanBoard,
  KanbanCard,
  KanbanCardToolbar,
} from '@/components/KanbanBoard';
import {
  DEFAULT_ROADMAP_COLUMNS,
  ROADMAP_ITEM_STATUS_LABEL,
  RoadmapItemStatus,
} from '@/types/enums';
import type { RoadmapItem } from '@/types/dto';
import { RoadmapItemDialog } from './components/RoadmapItemDialog';
import { RoadmapColumnsDialog } from './components/RoadmapColumnsDialog';
import { ShareLinkDialog } from '@/components/ShareLinkDialog';
import { RoadmapRiceChart } from './components/RoadmapRiceChart';
import { RoadmapRiceTable } from './components/RoadmapRiceTable';
import {
  useDeleteRoadmap,
  useReplaceRoadmapItems,
  useRoadmap,
  useSetRoadmapSharing,
  useUpdateRoadmap,
} from './api';

const STATUS_VARIANT: Record<RoadmapItemStatus, 'muted' | 'warning' | 'success'> = {
  [RoadmapItemStatus.IDEA]: 'muted',
  [RoadmapItemStatus.PLANNED]: 'muted',
  [RoadmapItemStatus.IN_PROGRESS]: 'warning',
  [RoadmapItemStatus.DONE]: 'success',
};

/** Roadmap item card visual — shared by the column list and the lifted drag overlay. */
export function RoadmapCard({ item, overlay = false }: { item: RoadmapItem; overlay?: boolean }) {
  return (
    <KanbanCard overlay={overlay}>
      <div className="flex items-start justify-between gap-1.5">
        <span className="min-w-0 text-[13px] leading-snug">{item.title}</span>
        <Badge variant="secondary" className="shrink-0 font-mono" title="RICE score">
          {item.rice}
        </Badge>
      </div>
      <Badge variant={STATUS_VARIANT[item.status]} className="self-start">
        {ROADMAP_ITEM_STATUS_LABEL[item.status]}
      </Badge>
      <ProgressBar value={item.progress} />
    </KanbanCard>
  );
}

/** A card's hover toolbar — edit + delete. `KanbanBoard` positions it and stops
 * pointer-down from starting a drag. */
function ItemToolbar({ onOpen, onRemove }: { onOpen?: () => void; onRemove: () => void }) {
  return (
    <>
      <button
        type="button"
        aria-label={t('common.edit')}
        title={t('common.edit')}
        className="grid size-7 place-items-center rounded-l-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.();
        }}
      >
        <Pencil className="size-3.5" />
      </button>
      <span className="h-4 w-px bg-border" aria-hidden />
      <button
        type="button"
        aria-label={t('common.delete')}
        title={t('common.delete')}
        className="grid size-7 place-items-center rounded-r-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="size-3.5" />
      </button>
    </>
  );
}

export function RoadmapBoardPage() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, canWrite, canManageDelivery } = useAuth();

  const { data: roadmap, isLoading } = useRoadmap(roadmapId);
  const replaceItems = useReplaceRoadmapItems();
  const deleteRoadmap = useDeleteRoadmap();
  const update = useUpdateRoadmap();
  const setSharing = useSetRoadmapSharing();

  const [dialogItem, setDialogItem] = useState<RoadmapItem | null>(null);
  const [dialogPhase, setDialogPhase] = useState<string>('now');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sortRice, setSortRice] = useState(false);
  // Persist the board/chart view in the URL (?view=chart) so it survives reloads
  // and is shareable; `board` is the default and kept out of the query for clean URLs.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view: 'board' | 'chart' | 'table' =
    viewParam === 'chart' ? 'chart' : viewParam === 'table' ? 'table' : 'board';
  const setView = (v: 'board' | 'chart' | 'table') => {
    const next = new URLSearchParams(searchParams);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }
  if (!roadmap) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('roadmaps.notFound')}{' '}
        <Link
          to="/roadmaps"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('roadmaps.title')}
        </Link>
      </div>
    );
  }

  const items = roadmap.items ?? [];
  const columns = roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;
  // Sorting the whole array by RICE and then filtering per column gives the same
  // per-column order as sorting each column, so the board can take it directly.
  const boardItems = sortRice ? [...items].sort((a, b) => b.rice - a.rice) : items;

  function save(next: RoadmapItem[]) {
    replaceItems.mutate({ id: roadmap!.id, items: next });
  }
  function upsertItem(item: RoadmapItem) {
    const exists = items.some((i) => i.id === item.id);
    save(exists ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]);
    setDialogOpen(false);
  }
  function removeItem(id: string) {
    if (confirm(t('roadmaps.confirmDeleteItem'))) save(items.filter((i) => i.id !== id));
  }
  /** Reorder is persisted as the items array's order, so a move splices the
   * dragged item into the raw array (not the RICE-sorted view). */
  function onMove(id: string, toPhase: string, overId: string | null) {
    const dragged = items.find((i) => i.id === id);
    if (!dragged) return;
    const moved = { ...dragged, phase: toPhase };

    const without = items.filter((i) => i.id !== id);
    if (overId) {
      const idx = without.findIndex((i) => i.id === overId);
      without.splice(idx < 0 ? without.length : idx, 0, moved);
    } else {
      // Dropped on a column's empty area → append after that column's last item.
      let insertAt = without.length;
      for (let k = without.length - 1; k >= 0; k--) {
        if (without[k].phase === toPhase) {
          insertAt = k + 1;
          break;
        }
      }
      without.splice(insertAt, 0, moved);
    }
    save(without);
  }

  return (
    // Same shell as every team board now — the view switch, title and actions
    // are the layout's job, so this page only describes what goes in them.
    <IssueBoardLayout
      title={roadmap.title}
      subtitle={roadmap.description}
      titleLabel={t('roadmaps.rename')}
      // Mirrors `@Roles(ADMIN, TESTER, PRODUCT)` on `PATCH /roadmaps/:id` —
      // the same gate the board's drag already uses.
      onTitleChange={
        canWrite ? (title) => update.mutate({ id: roadmap.id, input: { title } }) : undefined
      }
      view={{
        value: view,
        onChange: (v) => setView(v as 'board' | 'chart' | 'table'),
        options: [
          { value: 'board', label: t('roadmaps.viewBoard') },
          { value: 'chart', label: t('roadmaps.viewChart') },
          { value: 'table', label: t('roadmaps.viewTable') },
        ],
      }}
      actions={
        <>
          {view === 'board' && (
            <Button
              variant={sortRice ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSortRice((v) => !v)}
            >
              {t('roadmaps.sortRice')}
            </Button>
          )}
          {(canManageDelivery || isAdmin) && (
            <Menu
              align="right"
              triggerClassName="size-8 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              trigger={
                <>
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">{t('common.more')}</span>
                </>
              }
              items={[
                ...(canManageDelivery
                  ? [
                      { label: t('roadmaps.manageColumns'), onClick: () => setColumnsOpen(true) },
                      { label: t('share.share'), onClick: () => setShareOpen(true) },
                    ]
                  : []),
                ...(isAdmin
                  ? [
                      {
                        label: t('roadmaps.delete'),
                        danger: true,
                        onClick: () => {
                          if (confirm(t('roadmaps.confirmDelete')))
                            deleteRoadmap.mutate(roadmap.id, {
                              onSuccess: () => navigate('/roadmaps'),
                            });
                        },
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </>
      }
    >
      {view === 'board' ? (
        <KanbanBoard
          columns={columns}
          items={boardItems}
          getId={(i) => i.id}
          getColumnKey={(i) => i.phase}
          renderCard={(item, overlay) => <RoadmapCard item={item} overlay={overlay} />}
          onMove={onMove}
          disabled={!canWrite}
          onCardClick={
            canWrite
              ? (item) => {
                  setDialogItem(item);
                  setDialogOpen(true);
                }
              : undefined
          }
          renderCardToolbar={
            canWrite
              ? (item) => (
                  <ItemToolbar
                    onOpen={() => {
                      setDialogItem(item);
                      setDialogOpen(true);
                    }}
                    onRemove={() => removeItem(item.id)}
                  />
                )
              : undefined
          }
          onColumnAdd={
            canWrite
              ? (col) => {
                  setDialogItem(null);
                  setDialogPhase(col.key);
                  setDialogOpen(true);
                }
              : undefined
          }
          addLabel={t('roadmaps.addItem')}
        />
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto py-4 md:py-6', BOARD_GUTTER)}>
          {view === 'chart' ? (
            <div className="mx-auto w-full sm:w-1/2">
              <RoadmapRiceChart items={items} columns={columns} />
            </div>
          ) : (
            <RoadmapRiceTable
              items={items}
              columns={columns}
              onOpen={
                canWrite
                  ? (item) => {
                      setDialogItem(item);
                      setDialogOpen(true);
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}

      {dialogOpen && (
        <RoadmapItemDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          item={dialogItem ?? undefined}
          defaultPhase={dialogPhase}
          onSave={upsertItem}
          roadmapId={roadmap.id}
          projectId={roadmap.projectId}
          columns={columns}
        />
      )}
      {columnsOpen && (
        <RoadmapColumnsDialog
          open={columnsOpen}
          onClose={() => setColumnsOpen(false)}
          roadmapId={roadmap.id}
          columns={columns}
          items={items}
        />
      )}
      {shareOpen && (
        <ShareLinkDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={t('share.titleRoadmap')}
          hint={t('share.roadmapHint')}
          publicPath="roadmaps"
          enabled={roadmap.publicEnabled}
          publicToken={roadmap.publicToken}
          pending={setSharing.isPending}
          onToggle={(enabled) => setSharing.mutate({ id: roadmap.id, enabled })}
        />
      )}
    </IssueBoardLayout>
  );
}

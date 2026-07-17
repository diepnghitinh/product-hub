import { Fragment, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Menu, ProgressBar, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { BackLink } from '@/components/BackLink';
import {
  DEFAULT_ROADMAP_COLUMNS,
  ROADMAP_ITEM_STATUS_LABEL,
  RoadmapItemStatus,
} from '@/types/enums';
import type { RoadmapItem } from '@/types/dto';
import { RoadmapItemDialog } from './components/RoadmapItemDialog';
import { RoadmapColumnsDialog } from './components/RoadmapColumnsDialog';
import { RoadmapRiceChart } from './components/RoadmapRiceChart';
import { RoadmapRiceTable } from './components/RoadmapRiceTable';
import { useDeleteRoadmap, useReplaceRoadmapItems, useRoadmap } from './api';

// Mobile-first: columns stack vertically on small screens, then become a
// horizontally-scrollable multi-column board from `sm` up.
// Kanban board: stacks on mobile, then a horizontally-scrolling row of
// fixed-width columns (native scroll) from `sm` up.
const BOARD =
  'flex flex-col gap-4 sm:min-h-0 sm:flex-1 sm:flex-row sm:items-start sm:justify-start sm:overflow-x-auto sm:pb-3';

const STATUS_VARIANT: Record<RoadmapItemStatus, 'muted' | 'warning' | 'success'> = {
  [RoadmapItemStatus.IDEA]: 'muted',
  [RoadmapItemStatus.PLANNED]: 'muted',
  [RoadmapItemStatus.IN_PROGRESS]: 'warning',
  [RoadmapItemStatus.DONE]: 'success',
};

/** Roadmap item card visual — shared by the column list and the lifted drag overlay. */
function RoadmapCard({ item, overlay = false }: { item: RoadmapItem; overlay?: boolean }) {
  return (
    <article
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-foreground/20',
        overlay && 'w-[256px] rotate-3 cursor-grabbing shadow-2xl',
      )}
    >
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
    </article>
  );
}

/** A roadmap item that can be picked up — stays dimmed in place while the overlay
 * shows the lifted copy; a plain click (no drag) opens the editor. */
function DraggableItem({
  item,
  disabled,
  canWrite,
  onOpen,
  onRemove,
}: {
  item: RoadmapItem;
  disabled: boolean;
  canWrite: boolean;
  onOpen?: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: item.id,
    disabled,
  });
  // Also a drop target, so a card can be dropped at a precise position (before
  // this one) — enabling reorder within a pool and inserting mid-list across pools.
  const { setNodeRef: setDropRef } = useDroppable({ id: item.id, disabled: disabled || isDragging });
  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        'group relative touch-none',
        onOpen && 'cursor-pointer',
        isDragging && 'opacity-40',
      )}
    >
      <RoadmapCard item={item} />
      {canWrite && (
        // Stop pointer-down from reaching the draggable, so tapping a toolbar
        // button edits/deletes instead of starting a drag.
        <div
          className="absolute right-2 top-2 flex items-center rounded-md border bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
        >
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
        </div>
      )}
    </div>
  );
}

/** A phase column that accepts dropped cards. Deliberately shows no hover
 * highlight — the dashed placeholder already marks the exact landing slot, so
 * ringing the whole column on top of it is noise. */
function DroppableColumn({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[120px] flex-col rounded-xl border bg-card p-3 sm:max-h-full sm:w-[280px] sm:shrink-0"
    >
      {children}
    </div>
  );
}

export function RoadmapBoardPage() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, canWrite, canManageDelivery } = useAuth();

  const { data: roadmap, isLoading } = useRoadmap(roadmapId);
  const replaceItems = useReplaceRoadmapItems();
  const deleteRoadmap = useDeleteRoadmap();

  const [dialogItem, setDialogItem] = useState<RoadmapItem | null>(null);
  const [dialogPhase, setDialogPhase] = useState<string>('now');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [sortRice, setSortRice] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Height of the card being dragged, so the drop placeholder mirrors the exact
  // slot the card will occupy (matches old-report's `--kanban-drop-h`).
  const [dragHeight, setDragHeight] = useState<number | null>(null);
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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
  const activeItem = items.find((i) => i.id === activeId) ?? null;
  const columns = roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;
  const columnKeys = new Set(columns.map((c) => c.key));
  // Drop detection follows the POINTER, not the dragged card's centre (which sits
  // below the cursor for tall cards and made the placeholder land too low).
  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    if (pointer.length === 0) return closestCenter(args); // pointer in a gap → nearest
    // Prefer the card directly under the pointer over the column it sits in.
    const card = pointer.find((c) => !columnKeys.has(String(c.id)));
    return card ? [card] : pointer;
  };

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
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setOverId(null);
    setDragHeight(null);
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;

    const dragged = items.find((i) => i.id === activeKey);
    if (!dragged) return;

    // `over` is either another item (drop at its position) or a column (append).
    const overItem = items.find((i) => i.id === overKey);
    const targetPhase = overItem ? overItem.phase : overKey;
    const moved = { ...dragged, phase: targetPhase };

    const without = items.filter((i) => i.id !== activeKey);
    if (overItem) {
      const idx = without.findIndex((i) => i.id === overKey);
      without.splice(idx < 0 ? without.length : idx, 0, moved);
    } else {
      // Dropped on a column's empty area → append after that column's last item.
      let insertAt = without.length;
      for (let k = without.length - 1; k >= 0; k--) {
        if (without[k].phase === targetPhase) {
          insertAt = k + 1;
          break;
        }
      }
      without.splice(insertAt, 0, moved);
    }
    save(without);
  }

  function itemsFor(colKey: string, isFirst: boolean): RoadmapItem[] {
    // The first column also absorbs items whose column was removed (orphans),
    // so nothing is ever lost and they can be dragged back out.
    const list = items.filter(
      (i) => i.phase === colKey || (isFirst && !columnKeys.has(i.phase)),
    );
    return sortRice ? [...list].sort((a, b) => b.rice - a.rice) : list;
  }

  return (
    <div className="flex flex-col sm:h-full">
      <BackLink to="/roadmaps">{t('roadmaps.title')}</BackLink>

      <header className="mb-6 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{roadmap.title}</h1>
          {roadmap.description && (
            <p className="mt-1 text-sm text-muted-foreground">{roadmap.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'board' && (
            <Button variant={sortRice ? 'primary' : 'secondary'} size="sm" onClick={() => setSortRice((v) => !v)}>
              {t('roadmaps.sortRice')}
            </Button>
          )}
          <div className="inline-flex rounded-md border p-0.5">
            {(['board', 'chart', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={cn(
                  'rounded px-3 py-1 text-sm capitalize transition-colors',
                  view === v
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>
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
                  ? [{ label: t('roadmaps.manageColumns'), onClick: () => setColumnsOpen(true) }]
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
        </div>
      </header>

      {view === 'board' ? (
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(e: DragStartEvent) => {
          setActiveId(String(e.active.id));
          setDragHeight(e.active.rect.current.initial?.height ?? null);
        }}
        onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverId(null);
          setDragHeight(null);
        }}
      >
        <div className={BOARD}>
          {columns.map((col, ci) => (
            <DroppableColumn key={col.key} id={col.key}>
              <div className="flex items-center justify-between px-1.5 pb-3 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-2" style={{ color: col.color }}>
                  <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden />
                  {col.label}
                </span>
                <span className="tabular-nums">{itemsFor(col.key, ci === 0).length || ''}</span>
              </div>
              <div className="flex flex-col gap-2 sm:min-h-0 sm:overflow-y-auto">
                {itemsFor(col.key, ci === 0).map((item) => (
                  <Fragment key={item.id}>
                    {overId === item.id && activeItem && activeItem.id !== item.id && (
                      <div
                        className="box-border shrink-0 rounded-xl border-2 border-dashed border-primary bg-primary/10"
                        style={{ height: dragHeight ?? 68 }}
                        aria-hidden
                      />
                    )}
                    <DraggableItem
                      item={item}
                      disabled={!canWrite}
                      canWrite={canWrite}
                      onOpen={
                        canWrite
                          ? () => {
                              setDialogItem(item);
                              setDialogOpen(true);
                            }
                          : undefined
                      }
                      onRemove={() => removeItem(item.id)}
                    />
                  </Fragment>
                ))}
                {overId === col.key && activeItem && (
                  <div
                    className="box-border shrink-0 rounded-xl border-2 border-dashed border-primary bg-primary/10"
                    style={{ height: dragHeight ?? 68 }}
                    aria-hidden
                  />
                )}
              </div>
              {canWrite && (
                <button
                  type="button"
                  className="mt-2 flex w-full shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  style={{ color: col.color }}
                  onClick={() => {
                    setDialogItem(null);
                    setDialogPhase(col.key);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  {t('roadmaps.addItem')}
                </button>
              )}
            </DroppableColumn>
          ))}
          {canManageDelivery && (
            <button
              type="button"
              onClick={() => setColumnsOpen(true)}
              className="flex min-h-[120px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground sm:w-[200px]"
            >
              <Plus className="size-4" />
              {t('roadmaps.addColumn')}
            </button>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem ? <RoadmapCard item={activeItem} overlay /> : null}
        </DragOverlay>
      </DndContext>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
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
        />
      )}
    </div>
  );
}

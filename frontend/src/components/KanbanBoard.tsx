import { Fragment, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
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
import { cn } from '@/lib/utils';

/** A board column. Roadmap columns, bug statuses and task statuses all already
 * have this shape, so every board passes its own straight through. */
export interface KanbanColumn {
  key: string;
  label: string;
  color: string;
}

export interface KanbanBoardProps<T> {
  columns: KanbanColumn[];
  /** Rendered in the order given — pre-sort to control ordering within columns. */
  items: T[];
  getId: (item: T) => string;
  getColumnKey: (item: T) => string;
  /** Card visual. `overlay` renders the lifted copy that follows the cursor. */
  renderCard: (item: T, overlay?: boolean) => ReactNode;
  /**
   * A card landed. `overId` is the card it was dropped onto (i.e. its exact
   * slot), or null when dropped on a column's empty area. Boards that don't
   * persist ordering can ignore `overId` and just write `toColumn`.
   */
  onMove: (id: string, toColumn: string, overId: string | null) => void;
  /** Read-only — cards can't be picked up. */
  disabled?: boolean;
  onCardClick?: (item: T) => void;
  /** Hover toolbar pinned to a card's top-right (e.g. edit/delete). */
  renderCardToolbar?: (item: T) => ReactNode;
  /** Pinned under a column's list (e.g. "+ Add item"). */
  renderColumnFooter?: (col: KanbanColumn) => ReactNode;
  /** Trailing tile after the last column (e.g. "+ Add column"). */
  renderBoardEnd?: () => ReactNode;
}

// Mobile-first: columns stack vertically on small screens, then become a
// horizontally-scrolling row of fixed-width columns (native scroll) from `sm` up.
const BOARD =
  'flex flex-col gap-4 sm:min-h-0 sm:flex-1 sm:flex-row sm:items-start sm:justify-start sm:overflow-x-auto sm:pb-3';

/** A column that accepts dropped cards. Deliberately shows no hover highlight —
 * the dashed placeholder already marks the exact landing slot, so ringing the
 * whole column on top of it is noise. */
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

/** A card that can be picked up — stays dimmed in place while the overlay shows
 * the lifted copy. Also a drop target, so a card can land at a precise position
 * (before this one) rather than only at the end of a column. */
function DraggableCard({
  id,
  disabled,
  onClick,
  toolbar,
  children,
}: {
  id: string;
  disabled: boolean;
  onClick?: () => void;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    disabled,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id, disabled: disabled || isDragging });
  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      // Hidden (not dimmed) while dragging, so its slot collapses and the card
      // only appears as the lifted overlay + the dashed placeholder at the drop
      // target — never a ghost left behind in the source column.
      className={cn('group relative touch-none', onClick && 'cursor-pointer', isDragging && 'hidden')}
    >
      {children}
      {toolbar && (
        // Stop pointer-down from reaching the draggable, so tapping a toolbar
        // button acts instead of starting a drag.
        <div
          className="absolute right-2 top-2 flex items-center rounded-md border bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {toolbar}
        </div>
      )}
    </div>
  );
}

/**
 * The app's kanban: a full-height row of fixed-width columns that scrolls
 * horizontally, with drag-to-move, a lifted drag overlay and a card-sized drop
 * placeholder. Presentational — the caller owns the cards and persistence.
 */
export function KanbanBoard<T>({
  columns,
  items,
  getId,
  getColumnKey,
  renderCard,
  onMove,
  disabled = false,
  onCardClick,
  renderCardToolbar,
  renderColumnFooter,
  renderBoardEnd,
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Height of the card being dragged, so the placeholder mirrors the exact slot
  // the card will occupy.
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  // A little drag distance is required before a card lifts, so a plain click
  // still opens it.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const columnKeys = new Set(columns.map((c) => c.key));
  const activeItem = items.find((i) => getId(i) === activeId) ?? null;

  // Drop detection follows the POINTER, not the dragged card's centre (which
  // sits below the cursor for tall cards and made the placeholder land too low).
  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    if (pointer.length === 0) return closestCenter(args); // pointer in a gap → nearest
    // Prefer the card directly under the pointer over the column it sits in.
    const card = pointer.find((c) => !columnKeys.has(String(c.id)));
    return card ? [card] : pointer;
  };

  /** The first column also absorbs items whose column was removed (orphans), so
   * nothing is ever lost and they can be dragged back out. */
  function itemsFor(colKey: string, isFirst: boolean): T[] {
    return items.filter(
      (i) => getColumnKey(i) === colKey || (isFirst && !columnKeys.has(getColumnKey(i))),
    );
  }

  function reset() {
    setActiveId(null);
    setOverId(null);
    setDragHeight(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    reset();
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;
    // `over` is either another card (drop at its slot) or a column (append).
    const overItem = items.find((i) => getId(i) === overKey);
    onMove(activeKey, overItem ? getColumnKey(overItem) : overKey, overItem ? overKey : null);
  }

  const placeholder = (
    <div
      className="box-border shrink-0 rounded-xl border-2 border-dashed border-primary bg-primary/10"
      style={{ height: dragHeight ?? 68 }}
      aria-hidden
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Re-measure continuously: the dragged card is hidden, so columns reflow
      // mid-drag and the collision rects must stay in sync with the new layout.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={(e: DragStartEvent) => {
        setActiveId(String(e.active.id));
        setDragHeight(e.active.rect.current.initial?.height ?? null);
      }}
      onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <div className={BOARD}>
        {columns.map((col, ci) => {
          const list = itemsFor(col.key, ci === 0);
          return (
            <DroppableColumn key={col.key} id={col.key}>
              <div className="flex items-center justify-between px-1.5 pb-3 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-2" style={{ color: col.color }}>
                  <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden />
                  {col.label}
                </span>
                <span className="tabular-nums">{list.length || ''}</span>
              </div>
              <div className="flex flex-col gap-2 sm:min-h-0 sm:overflow-y-auto">
                {list.map((item) => {
                  const id = getId(item);
                  return (
                    <Fragment key={id}>
                      {overId === id && activeItem && getId(activeItem) !== id && placeholder}
                      <DraggableCard
                        id={id}
                        disabled={disabled}
                        onClick={onCardClick ? () => onCardClick(item) : undefined}
                        toolbar={renderCardToolbar?.(item)}
                      >
                        {renderCard(item)}
                      </DraggableCard>
                    </Fragment>
                  );
                })}
                {overId === col.key && activeItem && placeholder}
              </div>
              {renderColumnFooter?.(col)}
            </DroppableColumn>
          );
        })}
        {renderBoardEnd?.()}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? renderCard(activeItem, true) : null}
      </DragOverlay>
    </DndContext>
  );
}

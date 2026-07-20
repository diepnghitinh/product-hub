import { Fragment, useEffect, useState, type ReactNode } from 'react';
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
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { t } from '@/i18n';
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
  /**
   * When set, each column gets a "+ Add" affordance — a button revealed on
   * column hover in the header, and a full-width button under the list — both
   * calling this with the target column. Header and footer share one handler,
   * so every board's add looks and behaves identically.
   */
  onColumnAdd?: (col: KanbanColumn) => void;
  /** Label for those add affordances (footer text + header button tooltip). */
  addLabel?: string;
  // There is deliberately no "add a column" slot. A board's columns are a
  // team's statuses, owned by Settings (sidebar → Teams → settings) — letting a
  // board mint one would fork that config from the place the rest of the app
  // reads it.
}

/**
 * The card every board uses. The one piece a board still fills in itself is the
 * card's *content*; the shell lives here so Bugs, Tasks and Roadmap can't drift
 * apart the way they had (`gap-1.5` on one, `gap-2` on the others).
 *
 * Don't add `cursor-pointer` — `DraggableCard` applies it when `onCardClick` is set.
 */
export function KanbanCard({
  overlay = false,
  className,
  children,
}: {
  overlay?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        // Sits on the column's wash, so it needs less of its own weight: a
        // hairline border and a soft lift rather than a full card border.
        'flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 text-card-foreground shadow-sm transition-shadow hover:shadow-md',
        overlay && 'w-[256px] rotate-3 cursor-grabbing shadow-2xl',
        className,
      )}
    >
      {children}
    </article>
  );
}

/**
 * A card's hover toolbar. `KanbanBoard` positions it and stops pointer-down from
 * starting a drag; these buttons still stop click, so they don't also open the card.
 */
export function KanbanCardToolbar({
  onEdit,
  onRemove,
  editLabel,
  removeLabel,
}: {
  onEdit?: () => void;
  onRemove: () => void;
  editLabel: string;
  removeLabel: string;
}) {
  return (
    <>
      {onEdit && (
        <>
          <button
            type="button"
            aria-label={editLabel}
            title={editLabel}
            className="grid size-7 place-items-center rounded-l-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="size-3.5" />
          </button>
          <span className="h-4 w-px bg-border" aria-hidden />
        </>
      )}
      <button
        type="button"
        aria-label={removeLabel}
        title={removeLabel}
        className={cn(
          'grid size-7 place-items-center text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive',
          onEdit ? 'rounded-r-md' : 'rounded-md',
        )}
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

// Mobile-first: columns stack vertically on small screens, then become a
// horizontally-scrolling row of fixed-width columns (native scroll) from `sm` up.
const BOARD =
  'flex flex-col gap-4 p-4 sm:min-h-0 sm:flex-1 sm:flex-row sm:items-start sm:justify-start sm:overflow-x-auto md:px-8 md:py-6';

/**
 * Readable text for a solid `hex` fill — used by the column pill. Column colours
 * are user-picked, so this can't be a constant: a light amber needs dark text
 * where an indigo needs white. WCAG relative luminance.
 */
function readableOn(hex: string): string {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#ffffff';
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(full.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#1f2937' : '#ffffff';
}

/** The column body's wash — the same `color-mix` idiom the selects already use. */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** A column that accepts dropped cards. Deliberately shows no hover highlight —
 * the dashed placeholder already marks the exact landing slot, so ringing the
 * whole column on top of it is noise. */
function DroppableColumn({
  id,
  color,
  collapsed = false,
  children,
}: {
  id: string;
  color: string;
  collapsed?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      // Tinted from the column's own colour instead of `bg-card` + border: the
      // wash is what separates columns, so the border would just double it up.
      // `group/column` scopes the header's hover-reveal actions to this column.
      className={cn(
        'group/column flex min-h-[120px] flex-col rounded-xl p-3 sm:max-h-full sm:shrink-0',
        collapsed ? 'sm:w-12' : 'sm:w-[280px]',
      )}
      style={{ background: tint(color, 8) }}
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
  // The card collapses out of the flow while lifted, but only one frame late.
  // dnd-kit measures the dragged node *after* the render that flips `isDragging`,
  // and a `display:none` node measures 0×0 at 0,0 — which parks the drag overlay
  // at the viewport origin instead of under the cursor. So stay in the layout for
  // that first frame (merely invisible), then collapse once it's been measured.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!isDragging) {
      setCollapsed(false);
      return;
    }
    const frame = requestAnimationFrame(() => setCollapsed(true));
    return () => cancelAnimationFrame(frame);
  }, [isDragging]);

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
      className={cn(
        'group relative touch-none',
        onClick && 'cursor-pointer',
        isDragging && (collapsed ? 'hidden' : 'opacity-0'),
      )}
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
  onColumnAdd,
  addLabel,
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Which columns are collapsed to a rail. Presentational + per-session — resets
  // on reload, like the board's scroll position.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
          const isCollapsed = collapsed.has(col.key);
          return (
            <DroppableColumn key={col.key} id={col.key} color={col.color} collapsed={isCollapsed}>
              {/* Collapsed: a narrow rail (desktop only — mobile stacks, so
                  horizontal space isn't scarce there). The whole rail expands. */}
              <button
                type="button"
                onClick={() => toggleCollapse(col.key)}
                title={t('board.expandColumn')}
                aria-label={t('board.expandColumn')}
                className={cn(
                  'hidden flex-col items-center gap-3 rounded-lg py-1 transition-colors hover:bg-accent',
                  isCollapsed && 'sm:flex',
                )}
              >
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                <span
                  className="rounded-md px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide rotate-180 [writing-mode:vertical-rl]"
                  style={{ background: col.color, color: readableOn(col.color) }}
                >
                  {col.label}
                </span>
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {list.length}
                </span>
              </button>

              {/* Expanded body — hidden at sm+ when collapsed; always on mobile. */}
              <div className={cn('flex min-h-0 flex-1 flex-col', isCollapsed && 'sm:hidden')}>
                {/* The status reads as a solid pill; the count sits outside it, so
                    it's a fact about the column rather than part of its name. */}
                <div className="flex items-center gap-2 px-0.5 pb-3 pt-0.5">
                  <span
                    className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ background: col.color, color: readableOn(col.color) }}
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                    <span className="truncate">{col.label}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">
                    {list.length}
                  </span>
                  {/* Header actions ride in on column hover (pointer only — mobile
                      uses the always-visible footer button below). */}
                  <div className="ml-auto hidden items-center gap-0.5 text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover/column:opacity-100 sm:flex">
                    {onColumnAdd && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={addLabel}
                            onClick={() => onColumnAdd(col)}
                            className="grid size-6 place-items-center rounded-md transition-colors hover:bg-accent"
                            style={{ color: col.color }}
                          >
                            <Plus className="size-4" aria-hidden />
                          </button>
                        </TooltipTrigger>
                        {addLabel && <TooltipContent>{addLabel}</TooltipContent>}
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t('board.collapseColumn')}
                          onClick={() => toggleCollapse(col.key)}
                          className="grid size-6 place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <ChevronLeft className="size-4" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t('board.collapseColumn')}</TooltipContent>
                    </Tooltip>
                  </div>
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
                {onColumnAdd && (
                  <button
                    type="button"
                    onClick={() => onColumnAdd(col)}
                    className="mt-2 flex w-full shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors hover:bg-accent"
                    style={{ color: col.color }}
                  >
                    <Plus className="size-4" aria-hidden />
                    {addLabel}
                  </button>
                )}
              </div>
            </DroppableColumn>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? renderCard(activeItem, true) : null}
      </DragOverlay>
    </DndContext>
  );
}

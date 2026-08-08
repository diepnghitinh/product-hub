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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { ProgressBar, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { daysSince, formatDate } from '@/lib/format';

/** A board column. Roadmap columns, bug statuses and task statuses all already
 * have this shape, so every board passes its own straight through. */
export interface KanbanColumn {
  key: string;
  label: string;
  color: string;
}

/**
 * A horizontal band across the whole board — the second axis. Columns say *what
 * state* an item is in; a swimlane says *what it belongs to* (a roadmap epic
 * today, a team or an assignee tomorrow), and every lane repeats the same
 * columns so a row reads as one group's progress left to right.
 */
export interface KanbanSwimlane {
  key: string;
  label: string;
  color: string;
  /** A quiet second line under the lane's name — e.g. what the group is for. */
  description?: string;
  /** Anything the caller wants beside the name: a count, a progress bar, a ⋯ menu. */
  meta?: ReactNode;
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
   *
   * `toSwimlane` is the lane it landed in — always the caller's own lane key, and
   * always `undefined` on a board with no lanes, so a two-axis drag is one write.
   */
  onMove: (id: string, toColumn: string, overId: string | null, toSwimlane?: string) => void;
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
   *
   * `swimlane` is the lane the button sits in, so a create started inside a
   * group arrives already in that group.
   */
  onColumnAdd?: (col: KanbanColumn, swimlane?: KanbanSwimlane) => void;
  /** Label for those add affordances (footer text + header button tooltip). */
  addLabel?: string;
  /**
   * Turns the board into swimlanes: one band per entry, each holding the full
   * set of columns. Omit (or pass an empty array) for the plain single-band
   * board — every existing board, unchanged.
   *
   * Pass `getSwimlaneKey` alongside it; without one there is no way to tell
   * which band an item belongs to and they all land in the first.
   */
  swimlanes?: KanbanSwimlane[];
  getSwimlaneKey?: (item: T) => string;
  /**
   * When set, each column header gains a drag handle and columns can be dragged
   * into a new left-to-right order. Called with the full column list in its new
   * order — the caller persists it to whatever owns those columns (a team's
   * statuses, a roadmap's columns, a person's private board).
   *
   * Omit it and the board is exactly as it was: columns are fixed. This is the
   * *order* of existing columns only — see below.
   */
  onColumnsReorder?: (columns: KanbanColumn[]) => void;
  // There is deliberately no "add a column" slot. A board's columns are a
  // team's statuses, owned by Settings (sidebar → Teams → settings) — letting a
  // board mint one would fork that config from the place the rest of the app
  // reads it. Reordering is different in kind: it writes back through the same
  // config the owner screen edits, so the two can't disagree.
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
        'flex flex-col gap-2 rounded-lg border border-border/60 bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md',
        overlay && 'w-[256px] rotate-3 cursor-grabbing shadow-2xl',
        className,
      )}
    >
      {children}
    </article>
  );
}

/**
 * The age chip a card shows — how long an item has sat, e.g. "5d" (or "today").
 * Shared so Bugs, Tasks and Roadmap render the same clock+age the same way.
 */
export function BoardCardAge({ createdAt }: { createdAt?: string }) {
  if (!createdAt) return null;
  const days = daysSince(createdAt);
  return (
    <span className="flex items-center gap-1" title={`${t('board.createdOn')} ${formatDate(createdAt)}`}>
      <Clock className="size-3" aria-hidden />
      {days === 0 ? t('board.ageToday') : t('board.ageDays').replace('{n}', String(days))}
    </span>
  );
}

/**
 * The shared card *content*, taken from the roadmap item as the standard so every
 * board reads as one product: an optional cover, a title row (title + a trailing
 * badge), a meta row (a leading badge + a trailing chip cluster), and an optional
 * progress bar. Each board fills only the slots it has — a bug has no progress, a
 * task has no cover — and the ones it leaves empty simply don't render.
 *
 * This owns the `p-3` the bare `KanbanCard` deliberately omits (so a cover can be
 * full-bleed). Build a card by filling these slots, not by hand-rolling the frame.
 */
export function BoardCard({
  overlay = false,
  cover,
  titleDotColor,
  titleDotLabel,
  title,
  titleClassName,
  titleTrailing,
  labels,
  metaLeading,
  metaTrailing,
  progress,
}: {
  overlay?: boolean;
  /** Full-bleed cover image URL (roadmap items). */
  cover?: string;
  /** A small dot before the title — a CSS colour (bug severity, etc.). */
  titleDotColor?: string;
  /** Accessible name / hover tooltip for that dot (e.g. the severity label). */
  titleDotLabel?: string;
  title: ReactNode;
  /** Extra classes on the title text — e.g. strike-through for a done task. */
  titleClassName?: string;
  /** Top-right of the title row — a RICE / short-id badge. */
  titleTrailing?: ReactNode;
  /** A chip row under the title — the item's team labels (`<LabelChips>`). */
  labels?: ReactNode;
  /** Bottom-left — the primary badge (status, backlog item, assignee…). */
  metaLeading?: ReactNode;
  /** Bottom-right — a quiet chip cluster (difficulty, age…). */
  metaTrailing?: ReactNode;
  /** 0–100 progress bar; omit to hide it. */
  progress?: number;
}) {
  return (
    <KanbanCard overlay={overlay}>
      {cover && (
        <div
          aria-hidden
          style={{ backgroundImage: `url("${cover}")` }}
          // A centered background that fills the full-width banner (bg-cover) —
          // `bg-muted` shows through while it loads or behind a transparent image.
          className="h-28 w-full rounded-t-lg bg-muted bg-cover bg-center bg-no-repeat"
        />
      )}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-1.5">
          <span className={cn('flex min-w-0 items-start gap-1.5 text-[13px] leading-snug', titleClassName)}>
            {titleDotColor && (
              <span
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: titleDotColor }}
                title={titleDotLabel}
                role={titleDotLabel ? 'img' : undefined}
                aria-label={titleDotLabel}
                aria-hidden={titleDotLabel ? undefined : true}
              />
            )}
            <span className="min-w-0">{title}</span>
          </span>
          {titleTrailing && <span className="shrink-0">{titleTrailing}</span>}
        </div>
        {labels}
        {(metaLeading || metaTrailing) && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center">{metaLeading}</div>
            {metaTrailing && (
              <div className="flex shrink-0 items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground">
                {metaTrailing}
              </div>
            )}
          </div>
        )}
        {progress != null && <ProgressBar value={progress} />}
      </div>
    </KanbanCard>
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

// Swimlanes invert it: the lanes stack down the page and the *page* scrolls both
// ways, so every lane shares one horizontal offset and its columns stay aligned
// with the lane above. Columns grow to fit their cards rather than scrolling
// inside themselves — a lane is a band you read across, not a set of wells.
const BOARD_LANES = 'flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4 md:px-8 md:py-6';
const LANE_COLUMNS = 'flex flex-col gap-4 sm:w-fit sm:flex-row sm:items-start';

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
  fluid = false,
  lifted = false,
  insertion,
  children,
}: {
  id: string;
  color: string;
  collapsed?: boolean;
  /** Size to content instead of filling the board's height — swimlane mode,
   *  where the page scrolls rather than each column. */
  fluid?: boolean;
  /** This is the column currently being dragged — fades so the overlay reads as
   *  the thing that's moving. */
  lifted?: boolean;
  /** Where the dragged column would land relative to this one. */
  insertion?: 'before' | 'after';
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
        'group/column relative flex min-h-[120px] flex-col rounded-xl p-3 transition-opacity sm:shrink-0',
        !fluid && 'sm:max-h-full',
        collapsed ? 'sm:w-12' : 'sm:w-[280px]',
        lifted && 'opacity-40',
      )}
      style={{ background: tint(color, 8) }}
    >
      {/* A bar in the gap the column would slot into — the same "show the exact
          landing spot" idea as the card placeholder, turned on its side. Sits
          across the top/bottom edge while columns are stacked on mobile, and
          down the left/right edge once they're a row. */}
      {insertion && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute z-10 rounded-full bg-primary',
            'left-0 right-0 h-1 sm:bottom-0 sm:top-0 sm:h-auto sm:w-1',
            insertion === 'before'
              ? '-top-2.5 sm:-left-2.5 sm:right-auto'
              : '-bottom-2.5 sm:left-auto sm:-right-2.5',
          )}
        />
      )}
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
 * The grip that picks a column up. Namespaced ids (`col:3`) keep column drags and
 * card drags apart inside the one `DndContext` — a column key can't collide with
 * a card id by accident.
 */
const COLUMN_ID = 'col:';
const columnDragId = (ci: number) => `${COLUMN_ID}${ci}`;
const draggedColumnIndex = (id: string | null): number | null =>
  id?.startsWith(COLUMN_ID) ? Number(id.slice(COLUMN_ID.length)) : null;

function ColumnDragHandle({ index, label }: { index: number; label: string }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: columnDragId(index) });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          aria-label={label}
          {...attributes}
          {...listeners}
          className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The lifted copy of a column that follows the cursor — its pill and count, not
 *  the whole column: what's being moved is the column's *place*, not its cards. */
function ColumnDragPreview({ column, count }: { column: KanbanColumn; count: number }) {
  return (
    <div
      className="flex w-[280px] rotate-2 cursor-grabbing items-center gap-2 rounded-xl p-3 shadow-2xl"
      style={{ background: tint(column.color, 12) }}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ background: column.color, color: readableOn(column.color) }}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        <span className="truncate">{column.label}</span>
      </span>
      <span className="text-sm font-medium tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

/** The single implicit lane a board with no swimlanes renders into, so there is
 *  one render path rather than two that can drift. Its chrome is never drawn. */
const SOLO_LANE: KanbanSwimlane = { key: '', label: '', color: '' };

/**
 * The app's kanban: a full-height row of fixed-width columns that scrolls
 * horizontally, with drag-to-move, a lifted drag overlay and a card-sized drop
 * placeholder. Presentational — the caller owns the cards and persistence.
 *
 * Pass `swimlanes` and it gains a second axis: the same columns repeated in one
 * band per group, where a drag writes both the column and the group.
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
  swimlanes,
  getSwimlaneKey,
  onColumnsReorder,
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Which columns are collapsed to a rail. Presentational + per-session — resets
  // on reload, like the board's scroll position. Keyed by column, so collapsing
  // one collapses it in every lane: it's the same column, seen once per group.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // Which lanes are folded away. Same session-only treatment.
  const [foldedLanes, setFoldedLanes] = useState<Set<string>>(() => new Set());
  const toggle = (set: (fn: (prev: Set<string>) => Set<string>) => void, key: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleCollapse = (key: string) => toggle(setCollapsed, key);
  const toggleLane = (key: string) => toggle(setFoldedLanes, key);
  // Height of the card being dragged, so the placeholder mirrors the exact slot
  // the card will occupy.
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  // A little drag distance is required before a card lifts, so a plain click
  // still opens it.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const grouped = !!swimlanes?.length;
  const lanes = grouped ? swimlanes! : [SOLO_LANE];
  const columnKeys = new Set(columns.map((c) => c.key));
  const laneOrder = new Map(lanes.map((lane, i) => [lane.key, i]));
  /** Which lane an item belongs in. An item naming a lane that isn't on the
   *  board falls into the first one — the same "nothing is ever lost" rule the
   *  first column applies to items whose column was removed. */
  const laneIdxOf = (item: T) =>
    grouped && getSwimlaneKey ? (laneOrder.get(getSwimlaneKey(item)) ?? 0) : 0;

  const activeItem = items.find((i) => getId(i) === activeId) ?? null;

  // A drop target is one (lane, column) cell. Ids are built from indices, not
  // from the keys themselves, so a column key containing the separator — or a
  // lane and a column sharing a key — can't collide.
  const zoneId = (li: number, ci: number) => `zone:${li}:${ci}`;
  const zones = new Map<string, { column: string; lane: string }>();
  // Which column each cell belongs to, for a column drag: hovering any lane's
  // band works, since a column is the same column in every one of them.
  const zoneColumnIndex = new Map<string, number>();
  lanes.forEach((lane, li) =>
    columns.forEach((col, ci) => {
      zones.set(zoneId(li, ci), { column: col.key, lane: lane.key });
      zoneColumnIndex.set(zoneId(li, ci), ci);
    }),
  );

  // Which column is being dragged, if it's a column drag rather than a card one.
  const draggingColumn = draggedColumnIndex(activeId);
  const overColumn = draggingColumn == null ? null : (zoneColumnIndex.get(overId ?? '') ?? null);

  // Drop detection follows the POINTER, not the dragged card's centre (which
  // sits below the cursor for tall cards and made the placeholder land too low).
  const collisionDetection: CollisionDetection = (args) => {
    // A column can only land on another column, so the cards drop out of the
    // running entirely — otherwise the pointer passing over a card would resolve
    // to the card and the drag would have nowhere to go.
    if (draggedColumnIndex(String(args.active.id)) != null) {
      const onlyColumns = {
        ...args,
        droppableContainers: args.droppableContainers.filter((c) =>
          zoneColumnIndex.has(String(c.id)),
        ),
      };
      const hit = pointerWithin(onlyColumns);
      return hit.length ? hit : closestCenter(onlyColumns);
    }
    const pointer = pointerWithin(args);
    if (pointer.length === 0) return closestCenter(args); // pointer in a gap → nearest
    // Prefer the card directly under the pointer over the column it sits in.
    const card = pointer.find((c) => !zones.has(String(c.id)));
    return card ? [card] : pointer;
  };

  /** The first column also absorbs items whose column was removed (orphans), so
   * nothing is ever lost and they can be dragged back out. */
  function itemsFor(li: number, ci: number): T[] {
    const colKey = columns[ci].key;
    return items.filter(
      (i) =>
        laneIdxOf(i) === li &&
        (getColumnKey(i) === colKey || (ci === 0 && !columnKeys.has(getColumnKey(i)))),
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
    // A column landed. Pull it out and drop it in at the target's index — so a
    // column dragged rightwards ends up after the one it was released on, and
    // leftwards, before it. Exactly what the insertion bar was promising.
    const from = draggedColumnIndex(activeKey);
    if (from != null) {
      const to = zoneColumnIndex.get(overKey);
      if (to == null || to === from) return;
      const next = [...columns];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onColumnsReorder?.(next);
      return;
    }
    // `over` is either another card (drop at its exact slot, inheriting both of
    // that card's coordinates) or an empty cell (append to it).
    const overItem = items.find((i) => getId(i) === overKey);
    if (overItem) {
      const lane = grouped ? lanes[laneIdxOf(overItem)].key : undefined;
      onMove(activeKey, getColumnKey(overItem), overKey, lane);
      return;
    }
    const zone = zones.get(overKey);
    if (!zone) return;
    onMove(activeKey, zone.column, null, grouped ? zone.lane : undefined);
  }

  const placeholder = (
    <div
      className="box-border shrink-0 rounded-xl border-2 border-dashed border-primary bg-primary/10"
      style={{ height: dragHeight ?? 68 }}
      aria-hidden
    />
  );

  /** One lane's full set of columns. Extracted so the plain board and a lane of
   *  a swimlane board render the identical column — the drift this component
   *  exists to prevent starts with a second copy of this JSX. */
  const renderColumns = (lane: KanbanSwimlane, li: number) =>
    columns.map((col, ci) => {
      const id = zoneId(li, ci);
      const list = itemsFor(li, ci);
      const isCollapsed = collapsed.has(col.key);
      return (
        <DroppableColumn
          key={col.key}
          id={id}
          color={col.color}
          collapsed={isCollapsed}
          fluid={grouped}
          lifted={draggingColumn === ci}
          insertion={
            overColumn === ci && draggingColumn !== ci
              ? draggingColumn! < ci
                ? 'after'
                : 'before'
              : undefined
          }
        >
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
                {/* Reordering is a board-wide act on a column, so — like
                    collapsing — it's offered once, in the first lane. Pointer
                    only: the keyboard path to the same order is the screen that
                    owns these columns (Settings → Teams, or ⋯ → Manage columns). */}
                {onColumnsReorder && li === 0 && (
                  <ColumnDragHandle index={ci} label={t('board.reorderColumn')} />
                )}
                {onColumnAdd && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={addLabel}
                        onClick={() => onColumnAdd(col, grouped ? lane : undefined)}
                        className="grid size-6 place-items-center rounded-md transition-colors hover:bg-accent"
                        style={{ color: col.color }}
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    {addLabel && <TooltipContent>{addLabel}</TooltipContent>}
                  </Tooltip>
                )}
                {/* Collapsing is a column-wide act, so it's offered once — in the
                    first lane — rather than repeated in every band. */}
                {li === 0 && (
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
                )}
              </div>
            </div>
            <div className={cn('flex flex-col gap-2', !grouped && 'sm:min-h-0 sm:overflow-y-auto')}>
              {list.map((item) => {
                const cardId = getId(item);
                return (
                  <Fragment key={cardId}>
                    {overId === cardId && activeItem && getId(activeItem) !== cardId && placeholder}
                    <DraggableCard
                      id={cardId}
                      disabled={disabled}
                      onClick={onCardClick ? () => onCardClick(item) : undefined}
                      toolbar={renderCardToolbar?.(item)}
                    >
                      {renderCard(item)}
                    </DraggableCard>
                  </Fragment>
                );
              })}
              {overId === id && activeItem && placeholder}
            </div>
            {onColumnAdd && (
              <button
                type="button"
                onClick={() => onColumnAdd(col, grouped ? lane : undefined)}
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
    });

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
      <div className={grouped ? BOARD_LANES : BOARD}>
        {grouped
          ? lanes.map((lane, li) => {
              const folded = foldedLanes.has(lane.key);
              const count = items.filter((i) => laneIdxOf(i) === li).length;
              return (
                <section key={lane.key || '__none'} className="flex flex-col gap-3">
                  {/* Pinned to the left edge of the scroller: once the board is
                      scrolled into its right-hand columns you still need to know
                      which group the band you're reading belongs to. */}
                  <div className="sticky left-0 flex w-fit max-w-full items-center gap-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleLane(lane.key)}
                      aria-expanded={!folded}
                      className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent"
                    >
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform',
                          folded && '-rotate-90',
                        )}
                        aria-hidden
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: lane.color }}
                        aria-hidden
                      />
                      <span className="truncate text-sm font-semibold">{lane.label}</span>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </button>
                    {/* Secondary detail drops away on small screens — the name and
                        the count are what a lane has to say at any width. */}
                    {lane.description && (
                      <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
                        {lane.description}
                      </span>
                    )}
                    {lane.meta && (
                      <div className="flex shrink-0 items-center gap-2">{lane.meta}</div>
                    )}
                  </div>
                  {!folded && <div className={LANE_COLUMNS}>{renderColumns(lane, li)}</div>}
                </section>
              );
            })
          : renderColumns(SOLO_LANE, 0)}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          renderCard(activeItem, true)
        ) : draggingColumn != null && columns[draggingColumn] ? (
          <ColumnDragPreview
            column={columns[draggingColumn]}
            count={items.filter((i) => getColumnKey(i) === columns[draggingColumn].key).length}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

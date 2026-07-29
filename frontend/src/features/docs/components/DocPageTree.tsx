import { useMemo, useState, type DragEvent } from 'react';
import {
  ChevronRight,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button, Input, Menu, type MenuItem } from '@/components/ui';
import { TeamSymbol } from '@/components/TeamSymbol';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import type { DocPageSummary } from '@/types/dto';
import {
  buildDocTree,
  filterPages,
  movePage,
  positionDiff,
  visibleRows,
  type DropPosition,
} from '../tree';

interface DocPageTreeProps {
  pages: DocPageSummary[];
  activeId: string | undefined;
  onSelect: (pageId: string) => void;
  canWrite: boolean;
  /** Unresolved comment threads per page id — a page with a conversation open on
   *  it says so, so a reply isn't only found by opening every page. */
  openComments?: Record<string, number>;
  onAdd: (parentId: string) => void;
  /** Commits an inline rename. Only called with a title that actually changed. */
  onRename: (page: DocPageSummary, title: string) => void;
  onDelete: (page: DocPageSummary) => void;
  /** Commits a drag — the whole tree as it should look, plus the moved rows. */
  onMove: (next: DocPageSummary[], moved: { id: string; parentId: string; order: number }[]) => void;
}

interface DropTarget {
  id: string;
  position: DropPosition;
}

/** Carries the dragged page's id through the drag. `text/plain` too, so a page
 *  dropped outside the rail degrades to pasting its id rather than nothing. */
const DRAG_MIME = 'text/plain';

/** Which third of the row the pointer is in — top/bottom reorder, middle nests. */
function positionFor(e: DragEvent<HTMLElement>): DropPosition {
  const box = e.currentTarget.getBoundingClientRect();
  const offset = e.clientY - box.top;
  if (offset < box.height * 0.3) return 'before';
  if (offset > box.height * 0.7) return 'after';
  return 'inside';
}

/**
 * The doc's pages as a nested, draggable rail. Search filters the tree but keeps
 * a hit's ancestors, so a page nested three deep is still reachable by name.
 * Dragging is mouse-only by design: on touch the rows are already the primary
 * scroll surface, and a long-press-to-drag would fight it.
 */
export function DocPageTree({
  pages,
  activeId,
  onSelect,
  canWrite,
  openComments,
  onAdd,
  onRename,
  onDelete,
  onMove,
}: DocPageTreeProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  /** The row being renamed in place. Only ever one at a time. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => filterPages(pages, query), [pages, query]);
  // Searching expands everything — a filtered tree that stays collapsed hides
  // the very rows the search just found.
  const rows = useMemo(
    () => visibleRows(buildDocTree(filtered), query.trim() ? new Set<string>() : collapsed),
    [filtered, collapsed, query],
  );

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function commitDrop(e: DragEvent<HTMLElement>, targetId: string, position: DropPosition) {
    // The dragged page's id rides in the drag itself, not in state: `dragId` is
    // only there to grey the row out, and reading state here would tie the drop
    // to a React render having landed first.
    const sourceId = e.dataTransfer.getData(DRAG_MIME) || dragId;
    setDragId(null);
    setDrop(null);
    if (!sourceId) return;
    const next = movePage(pages, sourceId, targetId, position);
    if (!next) return;
    onMove(next, positionDiff(pages, next));
  }

  /** Blank or unchanged just closes the field — the input is uncontrolled, so
   *  there's nothing else to restore it with. */
  function commitRename(page: DocPageSummary, input: HTMLInputElement) {
    const next = input.value.trim();
    setEditingId(null);
    if (!next || next === page.title) return;
    onRename(page, next);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2">
        {/* The icon rides inside <Input>, which centres it against the field
         *  itself — positioned here it would centre against this padded wrapper
         *  and sit low. */}
        <Input
          icon={<Search aria-hidden />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('docs.searchPages')}
          aria-label={t('docs.searchPages')}
          className="h-8 text-[13px]"
        />
      </div>

      <nav aria-label={t('docs.pagesLabel')} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('docs.noPages')}</p>
        ) : (
          <ul className="flex flex-col">
            {rows.map(({ page, depth, children }) => {
              const isActive = page.id === activeId;
              const isDropping = drop?.id === page.id;
              const items: MenuItem[] = [
                {
                  label: t('docs.addSubPage'),
                  icon: <Plus className="size-4" />,
                  onClick: () => onAdd(page.id),
                },
                {
                  label: t('docs.renamePage'),
                  icon: <Pencil className="size-4" />,
                  // Hands focus to the inline field, so the menu must not take
                  // it back on close.
                  closeOnSelect: true,
                  onClick: () => setEditingId(page.id),
                },
                {
                  label: t('docs.deletePage'),
                  icon: <Trash2 className="size-4" />,
                  danger: true,
                  onClick: () => onDelete(page),
                },
              ];

              const isEditing = editingId === page.id;

              return (
                <li key={page.id}>
                  <div
                    // Searching reorders nothing: the filtered tree hides rows, so
                    // a drop's "before / after" would mean a position you can't see.
                    // A row being renamed isn't draggable either — a draggable
                    // ancestor swallows the click that places the caret.
                    draggable={canWrite && !query.trim() && !isEditing}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, page.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(page.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDrop(null);
                    }}
                    onDragOver={(e) => {
                      if (dragId === page.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDrop({ id: page.id, position: positionFor(e) });
                    }}
                    onDragLeave={() => setDrop((d) => (d?.id === page.id ? null : d))}
                    onDrop={(e) => {
                      e.preventDefault();
                      commitDrop(e, page.id, positionFor(e));
                    }}
                    className={cn(
                      'group relative flex items-center gap-1 rounded-md pr-1 transition-colors',
                      isActive ? 'bg-accent text-foreground' : 'hover:bg-accent/60',
                      dragId === page.id && 'opacity-40',
                      // Nesting highlights the whole row; reordering draws an edge.
                      isDropping && drop.position === 'inside' && 'ring-1 ring-inset ring-primary',
                    )}
                    style={{ paddingLeft: depth * 12 }}
                  >
                    {isDropping && drop.position !== 'inside' && (
                      <span
                        aria-hidden
                        className={cn(
                          'pointer-events-none absolute inset-x-1 h-0.5 rounded bg-primary',
                          drop.position === 'before' ? 'top-0' : 'bottom-0',
                        )}
                      />
                    )}

                    <button
                      type="button"
                      aria-label={page.title}
                      aria-expanded={children.length ? !collapsed.has(page.id) : undefined}
                      onClick={() => {
                        if (children.length) toggle(page.id);
                      }}
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground',
                        children.length ? 'hover:bg-muted' : 'invisible',
                      )}
                      tabIndex={children.length ? 0 : -1}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 transition-transform',
                          !collapsed.has(page.id) && 'rotate-90',
                        )}
                      />
                    </button>

                    {isEditing ? (
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 py-1">
                        <PageIcon icon={page.icon} color={page.color} />
                        <input
                          autoFocus
                          defaultValue={page.title}
                          maxLength={160}
                          aria-label={t('docs.pageTitle')}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={(e) => commitRename(page, e.currentTarget)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              // Snap back, then let blur close the field.
                              e.currentTarget.value = page.title;
                              e.currentTarget.blur();
                            }
                          }}
                          className="min-w-0 flex-1 rounded border border-primary bg-background px-1 py-0.5 text-[13px] outline-none ring-2 ring-ring/30"
                        />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(page.id)}
                        // Double-click to rename, the same shortcut the rest of
                        // the app's inline titles use.
                        onDoubleClick={() => canWrite && setEditingId(page.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                      >
                        <PageIcon icon={page.icon} color={page.color} />
                        <span
                          className={cn(
                            'min-w-0 truncate text-[13px]',
                            isActive ? 'font-medium' : 'text-foreground/80',
                          )}
                        >
                          {page.title || t('docs.untitled')}
                        </span>
                      </button>
                    )}

                    {/* Open threads on this page. Sits outside the title button so
                        it stays put while the title truncates around it. */}
                    {(openComments?.[page.id] ?? 0) > 0 && !isEditing && (
                      <span
                        title={t('docs.comments.openOnPage')}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary"
                      >
                        <MessageSquare className="size-2.5" aria-hidden />
                        {openComments?.[page.id]}
                      </span>
                    )}

                    {canWrite && !isEditing && (
                      // Always visible on touch, where there's no hover to reveal them.
                      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground"
                          aria-label={t('docs.addSubPage')}
                          title={t('docs.addSubPage')}
                          onClick={() => onAdd(page.id)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                        <Menu
                          align="right"
                          items={items}
                          // `Menu` renders its own trigger button — pass content,
                          // not a <Button>, or the DOM nests one inside the other.
                          triggerClassName="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          trigger={
                            <>
                              <MoreHorizontal className="size-3.5" aria-hidden />
                              <span className="sr-only">{t('common.more')}</span>
                            </>
                          }
                        />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {canWrite && (
        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start gap-2 text-[13px] text-muted-foreground"
            onClick={() => onAdd('')}
          >
            <Plus className="size-4" /> {t('docs.addPage')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A page's own symbol, or the generic page glyph when it hasn't picked one. */
function PageIcon({ icon, color }: { icon: string; color?: string | null }) {
  return icon ? (
    <TeamSymbol
      name={icon}
      size={14}
      className="text-muted-foreground"
      color={color ?? undefined}
    />
  ) : (
    <FileText
      className="size-3.5 shrink-0 text-muted-foreground"
      style={color ? { color } : undefined}
      aria-hidden
    />
  );
}

import { useMemo, useState } from 'react';
import { ChevronDown, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  formatDateRange,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import {
  countFilters,
  decodeDateRange,
  type FilterCategory,
  type FilterSelections,
} from './FilterMenu';

/**
 * One board's slot, e.g. `ph_filters:bugs:team-42`. Personal by design: a saved
 * filter is one person's shortcut, not the team's config, so it never leaves the
 * browser (contrast a team's statuses, which are workspace config in Settings).
 */
const KEY_PREFIX = 'ph_filters:';
/** Enough for anyone's shortcuts, and a ceiling on the slot's size. */
const MAX_VIEWS = 20;
const MAX_NAME = 40;

export interface SavedFilterView {
  id: string;
  name: string;
  selections: FilterSelections;
  /** The toolbar's search box — a saved filter reproduces the whole narrowed list. */
  search: string;
}

/** What the board's toolbar is narrowed to right now — restored on the next visit. */
interface FilterState {
  selections: FilterSelections;
  search: string;
  /** The saved view this state came from, while it still matches it. */
  activeId?: string;
}

interface FilterScope {
  views: SavedFilterView[];
  last?: FilterState;
}

const emptyState = (): FilterState => ({ selections: {}, search: '' });

/** Everything held is `Record<string, string[]>`; anything else is not ours. */
function isSelections(value: unknown): value is FilterSelections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
  );
}

function readScope(scopeKey: string): FilterScope {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY_PREFIX + scopeKey) || '{}');
    const views: SavedFilterView[] = (Array.isArray(parsed.views) ? parsed.views : [])
      .filter(
        (v: Partial<SavedFilterView> | null) =>
          !!v && typeof v.id === 'string' && !!v.name && isSelections(v.selections),
      )
      .map((v: SavedFilterView) => ({
        id: v.id,
        name: String(v.name).slice(0, MAX_NAME),
        selections: v.selections,
        search: typeof v.search === 'string' ? v.search : '',
      }));
    const raw = parsed.last;
    const last: FilterState | undefined = isSelections(raw?.selections)
      ? {
          selections: raw.selections,
          search: typeof raw.search === 'string' ? raw.search : '',
          activeId: typeof raw.activeId === 'string' ? raw.activeId : undefined,
        }
      : undefined;
    return { views: views.slice(0, MAX_VIEWS), last };
  } catch {
    // A half-written or hand-edited slot must never take a board down with it —
    // the worst case is a board that opens unfiltered.
    return { views: [] };
  }
}

function writeScope(scopeKey: string, scope: FilterScope) {
  try {
    localStorage.setItem(KEY_PREFIX + scopeKey, JSON.stringify(scope));
  } catch {
    // Storage full or blocked (a private window): the board still filters, it
    // just won't remember. Not worth interrupting anyone over.
  }
}

/** Selections as one comparable string — key order and click order don't count,
 *  so re-ticking the same boxes never reads as "unsaved changes". */
const normalize = (selections: FilterSelections) =>
  Object.entries(selections)
    .filter(([, ids]) => ids?.length)
    .map(([key, ids]) => `${key}=${[...ids].sort().join(',')}`)
    .sort()
    .join('|');

const sameState = (
  a: { selections: FilterSelections; search: string },
  b: { selections: FilterSelections; search: string },
) => a.search.trim() === b.search.trim() && normalize(a.selections) === normalize(b.selections);

export interface SavedFiltersApi {
  /** Drop-in for the page's old `useState` pair — pass straight to `FilterMenu`. */
  filters: FilterSelections;
  setFilters: (next: FilterSelections) => void;
  search: string;
  setSearch: (next: string) => void;
  /** Back to the unfiltered board, stepping off any applied view. */
  clear: () => void;
  views: SavedFilterView[];
  activeId?: string;
  /** The applied view has been edited since it was applied. */
  dirty: boolean;
  apply: (id: string) => void;
  saveAs: (name: string) => void;
  updateActive: () => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

/**
 * A board's filter state, remembered.
 *
 * Replaces the `useState<FilterSelections>({})` + `useState('')` pair every board
 * used to hold, and adds two things on top of it:
 *
 * - **Sticky.** The board reopens exactly as it was left. The `FilterMenu` badge
 *   and the chip strip both say so on screen, and "All" / "Clear all" undo it —
 *   so a filtered board can't be mistaken for an empty one.
 * - **Named views.** Any state can be saved as a chip (see {@link SavedFilterChips}).
 *
 * `scopeKey` is the board, and switching it swaps the whole set: `/issues` in Task
 * mode and Bug mode are different boards with different categories, so they get
 * `issues:all:task` and `issues:all:bug` and never see each other's filters.
 *
 * Option ids are stored as-is, so a view can outlive one of its options (a
 * deleted project, a renamed status). Nothing breaks: the API simply matches
 * nothing for that id, and the chip names the category instead of the value.
 */
export function useSavedFilters(scopeKey: string): SavedFiltersApi {
  const [live, setLive] = useState(() => {
    const scope = readScope(scopeKey);
    return { views: scope.views, state: scope.last ?? emptyState() };
  });
  const [scope, setScope] = useState(scopeKey);

  // The board changed under us (the Task|Bug switch). Reset during render rather
  // than in an effect, so the first render of the new board already has its own
  // filters — an effect would fetch the previous board's list first.
  if (scope !== scopeKey) {
    writeScope(scope, { views: live.views, last: live.state });
    const next = readScope(scopeKey);
    setScope(scopeKey);
    setLive({ views: next.views, state: next.last ?? emptyState() });
  }

  /** Written straight through on every change: the slot is a few hundred bytes,
   *  and debouncing would lose the last edits when the page is left at once. */
  const commit = (next: typeof live) => {
    setLive(next);
    writeScope(scopeKey, { views: next.views, last: next.state });
  };

  const active = live.views.find((v) => v.id === live.state.activeId);

  return {
    filters: live.state.selections,
    search: live.state.search,
    views: live.views,
    // A view deleted in another tab leaves an id pointing at nothing; that reads
    // as "no view applied" rather than as a stuck chip.
    activeId: active?.id,
    dirty: !!active && !sameState(active, live.state),

    setFilters: (selections) => commit({ ...live, state: { ...live.state, selections } }),
    setSearch: (search) => commit({ ...live, state: { ...live.state, search } }),
    clear: () => commit({ ...live, state: emptyState() }),

    apply: (id) => {
      const view = live.views.find((v) => v.id === id);
      if (!view) return;
      commit({
        ...live,
        state: { selections: view.selections, search: view.search, activeId: view.id },
      });
    },

    saveAs: (name) => {
      const clean = name.trim().slice(0, MAX_NAME);
      if (!clean) return;
      const view: SavedFilterView = {
        id: crypto.randomUUID(),
        name: clean,
        selections: live.state.selections,
        search: live.state.search,
      };
      // Oldest out at the ceiling, so saving one more never silently fails.
      commit({
        views: [...live.views, view].slice(-MAX_VIEWS),
        state: { ...live.state, activeId: view.id },
      });
    },

    updateActive: () => {
      if (!active) return;
      commit({
        ...live,
        views: live.views.map((v) =>
          v.id === active.id
            ? { ...v, selections: live.state.selections, search: live.state.search }
            : v,
        ),
      });
    },

    rename: (id, name) => {
      const clean = name.trim().slice(0, MAX_NAME);
      if (!clean) return;
      commit({
        ...live,
        views: live.views.map((v) => (v.id === id ? { ...v, name: clean } : v)),
      });
    },

    // Only the shortcut goes — what's on screen stays, so a delete never also
    // reshuffles the list the user is reading.
    remove: (id) =>
      commit({
        views: live.views.filter((v) => v.id !== id),
        state: live.state.activeId === id ? { ...live.state, activeId: undefined } : live.state,
      }),
  };
}

/**
 * What a filter state actually says, in the board's own words — "In Progress,
 * Blocked · Critical · Created date: 1–31 Jul". Used as the suggested name when
 * saving and as a chip's tooltip.
 *
 * An id the menu no longer offers is named by its category (`Project (2)`)
 * rather than shown raw: a saved view outlives the options it was built from.
 */
function describe(
  categories: FilterCategory[],
  selections: FilterSelections,
  search: string,
): string {
  const parts: string[] = [];
  if (search.trim()) parts.push(`“${search.trim()}”`);
  for (const cat of categories) {
    const ids = selections[cat.id];
    if (!ids?.length) continue;
    if (cat.type === 'date') {
      const { start, end } = decodeDateRange(ids);
      const range = formatDateRange(start, end);
      if (range) parts.push(`${cat.label}: ${range}`);
      continue;
    }
    const labels = cat.options.filter((o) => ids.includes(o.id)).map((o) => o.label);
    if (labels.length === 0) parts.push(`${cat.label} (${ids.length})`);
    else
      parts.push(
        labels.slice(0, 2).join(', ') + (labels.length > 2 ? ` +${labels.length - 2}` : ''),
      );
  }
  return parts.join(' · ');
}

/** The toolbar chip — one shape for "All", each saved view, and "+ Save".
 *  `h-9` to sit level with the row's `Filter` button and search box. */
const CHIP =
  'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const CHIP_IDLE = 'text-muted-foreground hover:bg-accent hover:text-foreground';
/** Applied reads as brand-tinted rather than brand-filled: the solid fill in this
 *  row already belongs to the Task|Bug switch and the page's primary action, and
 *  three solid purples in one toolbar stop telling them apart. */
const CHIP_ON = 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15';

/**
 * The saved-filter strip: `( All )( My open crashes • )( Blockers )( + )`, sitting
 * beside its board's `FilterMenu`. **Every `FilterMenu` gets one** — the menu
 * picks the values, this remembers them, and boards that only had the menu were
 * the ones losing the same filter combination twenty times a day.
 *
 * Nothing renders until there's something to show (no views saved and an
 * unfiltered board), so a board looks untouched until the feature is used.
 *
 * A dot on the active chip means it's been edited since it was applied; its
 * caret menu then offers "Update with current filters". The caret is on the
 * active chip only and is always visible there — no hover-reveal, so it works
 * the same on a phone.
 */
export function SavedFilterChips({
  state,
  categories,
  className,
}: {
  state: SavedFiltersApi;
  /** The same list passed to `FilterMenu` — used to name what a view holds. */
  categories?: FilterCategory[];
  className?: string;
}) {
  const { views, activeId, dirty, filters, search, apply, clear } = state;
  const [saveOpen, setSaveOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);

  const summary = useMemo(
    () => describe(categories ?? [], filters, search),
    [categories, filters, search],
  );
  /** Is there anything on screen worth keeping? */
  const narrowed = countFilters(filters) > 0 || search.trim().length > 0;
  // Sitting cleanly on a saved view: there's nothing new to save.
  const canSave = narrowed && (dirty || !activeId);

  if (views.length === 0 && !narrowed) return null;

  return (
    <>
      {/* On a phone this takes its own line inside the toolbar's wrap and scrolls
          sideways (chips stay one line, thumb-swipeable). From `sm` up it wraps
          instead, so a long list is never hidden behind an invisible scroll. */}
      <div
        className={cn(
          'flex w-full min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] sm:w-auto sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden',
          className,
        )}
      >
        {views.length > 0 && (
          <button
            type="button"
            aria-pressed={!activeId && !narrowed}
            onClick={clear}
            className={cn(CHIP, !activeId && !narrowed ? CHIP_ON : CHIP_IDLE)}
          >
            {t('filters.savedAll')}
          </button>
        )}

        {views.map((view) => {
          const on = view.id === activeId;
          return (
            <span key={view.id} className={cn(CHIP, 'gap-0 px-0', on ? CHIP_ON : CHIP_IDLE)}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => apply(view.id)}
                title={describe(categories ?? [], view.selections, view.search) || view.name}
                className="flex h-full max-w-[12rem] items-center gap-1.5 rounded-md px-2.5 outline-none"
              >
                <span className="truncate">{view.name}</span>
                {on && dirty && (
                  <span
                    title={t('filters.savedUnsaved')}
                    aria-label={t('filters.savedUnsaved')}
                    className="size-1.5 shrink-0 rounded-full bg-primary"
                  />
                )}
              </button>

              {/* Manage lives on the applied chip — one click on any other chip
                  applies it, which is also how you get to its own menu. */}
              {on && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t('filters.savedActions')}
                      className="flex h-full items-center rounded-r-md border-l border-primary/30 px-1.5 outline-none hover:bg-primary/15"
                    >
                      <ChevronDown className="size-3.5" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {dirty && (
                      <DropdownMenuItem onSelect={() => state.updateActive()}>
                        <Save className="size-4" aria-hidden />
                        {t('filters.savedUpdate')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setRenameId(view.id)}>
                      <Pencil className="size-4" aria-hidden />
                      {t('filters.savedRename')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        if (confirm(t('filters.savedConfirmDelete'))) state.remove(view.id);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      {t('filters.savedDelete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </span>
          );
        })}

        {canSave && (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            title={t('filters.savedSave')}
            aria-label={t('filters.savedSave')}
            className={cn(CHIP, CHIP_IDLE, 'border-dashed')}
          >
            <Plus className="size-3.5" aria-hidden />
            {/* Spelled out until the first view exists — a lone "+" says nothing. */}
            {views.length === 0 && <span>{t('filters.savedSave')}</span>}
          </button>
        )}
      </div>

      {/* Mounted per open, so each dialog starts from the right name. */}
      {saveOpen && (
        <NameDialog
          title={t('filters.savedSaveTitle')}
          hint={summary}
          initial={summary.slice(0, MAX_NAME)}
          submitLabel={t('common.save')}
          onSubmit={(name) => {
            state.saveAs(name);
            setSaveOpen(false);
          }}
          onClose={() => setSaveOpen(false)}
        />
      )}
      {renameId && (
        <NameDialog
          title={t('filters.savedRenameTitle')}
          initial={views.find((v) => v.id === renameId)?.name ?? ''}
          submitLabel={t('common.save')}
          onSubmit={(name) => {
            state.rename(renameId, name);
            setRenameId(null);
          }}
          onClose={() => setRenameId(null)}
        />
      )}
    </>
  );
}

/** Name a saved filter — used for both saving and renaming. */
function NameDialog({
  title,
  hint,
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  /** What's being saved, in words — shown under the field so the name can be checked against it. */
  hint?: string;
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const clean = name.trim();

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={!clean} onClick={() => onSubmit(clean)}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="saved-filter-name">
          {t('filters.savedName')}
        </label>
        <Input
          id="saved-filter-name"
          autoFocus
          value={name}
          maxLength={MAX_NAME}
          placeholder={t('filters.savedNamePlaceholder')}
          onChange={(e) => setName(e.target.value)}
          // Enter submits: the footer button sits outside this field's form.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && clean) {
              e.preventDefault();
              onSubmit(clean);
            }
          }}
        />
        {/* What's being saved, in words — dropped while the name is still the
            suggestion, where it would just echo the field above it. */}
        {hint && hint !== clean && <p className="pt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Dialog>
  );
}

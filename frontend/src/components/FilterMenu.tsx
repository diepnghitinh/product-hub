import { useMemo, useState, type ReactNode } from 'react';
import { Check, ListFilter, Search } from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  formatDateRange,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/**
 * Sentinel for the "Unassigned" option. Unassigned is stored as `''`, but a bare
 * `?assigneeId=` is indistinguishable from "filter not set", so the API takes
 * this sentinel and maps it back (see the backend's `UNASSIGNED_QUERY`).
 */
export const UNASSIGNED = '__unassigned__';

export interface FilterOption {
  id: string;
  label: string;
  /** Optional dot colour — reuse the board's status/severity colours. */
  color?: string;
}

/** A checkable list of values — the default kind of category. */
export interface FilterOptionCategory {
  id: string;
  label: string;
  icon?: ReactNode;
  type?: 'options';
  options: FilterOption[];
  /** Show a type-to-filter box — worth it for long lists like people. */
  searchable?: boolean;
}

/** An inclusive `YYYY-MM-DD` window. Either end may be `''` — an open-ended
 *  range ("since 1 July", "up to 31 July"), which is a normal thing to ask for. */
export interface FilterDateRange {
  start: string;
  end: string;
}

/** A quick-pick row in a date category. `range()` runs at click time, so
 *  "Last 7 days" resolves against *today*, not whenever the menu was built. */
export interface FilterDatePreset {
  key: string;
  label: string;
  range: () => FilterDateRange;
}

/** A date window instead of a value list — created/solved dates and the like. */
export interface FilterDateCategory {
  id: string;
  label: string;
  icon?: ReactNode;
  type: 'date';
  /** Quick-picks above the two inputs. Defaults to {@link pastDateFilterPresets}. */
  presets?: FilterDatePreset[];
}

export type FilterCategory = FilterOptionCategory | FilterDateCategory;

/**
 * categoryId → selected values. Absent/empty = that filter is off.
 *
 * A date category stores exactly one entry, `"<start>..<end>"` — see
 * {@link encodeDateRange}. Keeping every kind of filter in one flat record is
 * what lets the trigger badge, "Clear all" and the caller's `useState` stay
 * unaware of which kind a category is.
 */
export type FilterSelections = Record<string, string[]>;

/** A range → the single value stored for a date category (`[]` when unset, so
 *  an empty range drops out of the selections exactly like an empty list does). */
export function encodeDateRange({ start, end }: FilterDateRange): string[] {
  return start || end ? [`${start}..${end}`] : [];
}

/** The stored value → a range; `{ start: '', end: '' }` when the filter is off. */
export function decodeDateRange(ids?: string[]): FilterDateRange {
  const [start = '', end = ''] = (ids?.[0] ?? '').split('..');
  return { start, end };
}

/**
 * A picked range → the two instants an API date filter takes.
 *
 * The endpoints are the *user's own* calendar days, so each is resolved in local
 * time and sent as a full instant rather than a bare `YYYY-MM-DD`. Sent bare, the
 * server would read "31 July" as UTC's 31 July — and in UTC+7 that drops
 * everything from the first seven hours of the working day out of its own date.
 * `to` covers the whole closing day, so a range is inclusive at both ends.
 */
export function dateRangeParams({ start, end }: FilterDateRange): {
  from?: string;
  to?: string;
} {
  return {
    from: start ? new Date(`${start}T00:00:00`).toISOString() : undefined,
    to: end ? new Date(`${end}T23:59:59.999`).toISOString() : undefined,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local (timezone-safe) `YYYY-MM-DD` — never round-trips through UTC. */
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Backward-looking quick-picks — the right default for a filter, where every
 * date being asked about has already happened (when was this bug opened? when
 * was it fixed?). Contrast `forwardDateRangePresets`, which a *deadline* field
 * uses.
 */
export function pastDateFilterPresets(today = new Date()): FilterDatePreset[] {
  const day = (d: Date): FilterDateRange => ({ start: toISO(d), end: toISO(d) });
  const since = (d: Date): FilterDateRange => ({ start: toISO(d), end: toISO(today) });
  const monthStart = (offset: number) => new Date(today.getFullYear(), today.getMonth() + offset, 1);
  return [
    { key: 'today', label: t('filters.dateToday'), range: () => day(today) },
    { key: 'yesterday', label: t('filters.dateYesterday'), range: () => day(addDays(today, -1)) },
    {
      key: 'this-week',
      // The calendar week the user is in, edge to edge — Sunday through Saturday,
      // the same week `DateRangePicker`'s "This week" uses, so the two agree.
      // The tail is in the future for a past-facing field, which is harmless:
      // nothing is stamped later than now, so it reads as "so far this week".
      label: t('filters.dateThisWeek'),
      range: () => {
        const start = addDays(today, -today.getDay());
        return { start: toISO(start), end: toISO(addDays(start, 6)) };
      },
    },
    { key: 'last-7', label: t('filters.dateLast7'), range: () => since(addDays(today, -6)) },
    { key: 'last-30', label: t('filters.dateLast30'), range: () => since(addDays(today, -29)) },
    { key: 'this-month', label: t('filters.dateThisMonth'), range: () => since(monthStart(0)) },
    {
      key: 'last-month',
      label: t('filters.dateLastMonth'),
      // The whole previous month: its 1st through the day before this month's.
      range: () => ({ start: toISO(monthStart(-1)), end: toISO(addDays(monthStart(0), -1)) }),
    },
  ];
}

interface FilterMenuProps {
  categories: FilterCategory[];
  value: FilterSelections;
  onChange: (next: FilterSelections) => void;
  /**
   * Trigger size, matching `Button`'s. Use `default` (h-9) next to an `Input`
   * or a full-size button; `sm` (h-8) in a compact toolbar.
   */
  size?: 'sm' | 'default';
  className?: string;
}

/** Total selected options across every category — drives the trigger badge. */
export function countFilters(value: FilterSelections): number {
  return Object.values(value).reduce((n, ids) => n + (ids?.length ?? 0), 0);
}

/**
 * Multi-select filter menu: a single trigger opening one submenu per category.
 * Rebuilt natively on the app's dropdown-menu + tokens (the old-frontend
 * component it mirrors is `tw-`-prefixed and can't be used here).
 */
export function FilterMenu({
  categories,
  value,
  onChange,
  size = 'sm',
  className,
}: FilterMenuProps) {
  const active = countFilters(value);

  /** Replace one category's selection; an empty one is removed outright, so
   *  `value` only ever holds filters that are actually on (what the count, the
   *  "Clear all" row and every caller's query params read). */
  const set = (categoryId: string, next: string[]) => {
    const merged = { ...value, [categoryId]: next };
    if (next.length === 0) delete merged[categoryId];
    onChange(merged);
  };

  const toggle = (categoryId: string, optionId: string) => {
    const current = value[categoryId] ?? [];
    set(
      categoryId,
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={cn('gap-1.5', className)}>
          <ListFilter className="size-3.5" aria-hidden />
          {t('filters.title')}
          {active > 0 && (
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] tabular-nums">
              {active}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        {categories.map((cat) =>
          cat.type === 'date' ? (
            <DateSub
              key={cat.id}
              category={cat}
              value={decodeDateRange(value[cat.id])}
              onChange={(range) => set(cat.id, encodeDateRange(range))}
            />
          ) : (
            <CategorySub
              key={cat.id}
              category={cat}
              selected={value[cat.id] ?? []}
              onToggle={(optionId) => toggle(cat.id, optionId)}
            />
          ),
        )}
        {active > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange({})}>
              {t('filters.clearAll')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CategorySub({
  category,
  selected,
  onToggle,
}: {
  category: FilterOptionCategory;
  selected: string[];
  onToggle: (optionId: string) => void;
}) {
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return category.options;
    return category.options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [category.options, query]);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {category.icon}
          <span className="truncate">{category.label}</span>
        </span>
        {selected.length > 0 && (
          <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px] tabular-nums">
            {selected.length}
          </Badge>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
          {category.searchable && (
            <div className="flex items-center gap-1.5 border-b px-2 pb-1.5">
              <Search className="size-3.5 shrink-0 opacity-50" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // The menu's typeahead would otherwise swallow every keystroke.
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={t('filters.search')}
                aria-label={t('filters.search')}
                className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          {shown.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {t('filters.noMatches')}
            </p>
          ) : (
            shown.map((o) => {
              const checked = selected.includes(o.id);
              return (
                // A plain item (not CheckboxItem) so the label sits tight to the
                // left — the colour dot is the indicator, and a right-aligned
                // Check marks selection, so no left checkmark gutter is needed.
                <DropdownMenuItem
                  key={o.id}
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  className="pr-8"
                  // Keep the menu open so several options can be picked in a row.
                  onSelect={(e) => {
                    e.preventDefault();
                    onToggle(o.id);
                  }}
                >
                  {o.color && (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: o.color }}
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {checked && <Check className="absolute right-2 size-4" aria-hidden />}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

/**
 * A date category's submenu: quick-picks on top, then the two endpoints for
 * anything they don't cover. Presets write a *concrete* range rather than a
 * "last 7 days" token, so a filter never silently drifts as the days pass —
 * what you picked is what stays on screen, and the matching row simply stops
 * being ticked tomorrow.
 *
 * The endpoints are native `<input type="date">`: it puts a real calendar (and
 * the OS picker on a phone) inside a menu, where the app's own popover-based
 * DatePicker would be a popover nested in a popover. `color-scheme` is set so
 * that calendar follows the app's theme.
 */
function DateSub({
  category,
  value,
  onChange,
}: {
  category: FilterDateCategory;
  value: FilterDateRange;
  onChange: (range: FilterDateRange) => void;
}) {
  const presets = useMemo(
    () => category.presets ?? pastDateFilterPresets(),
    [category.presets],
  );
  const summary = formatDateRange(value.start, value.end);
  const isSet = Boolean(value.start || value.end);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {category.icon}
          <span className="truncate">{category.label}</span>
        </span>
        {summary && (
          <span className="ml-2 max-w-[7.5rem] shrink-0 truncate text-[11px] text-muted-foreground">
            {summary}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-h-[22rem] w-60 overflow-y-auto">
          {presets.map((p) => {
            const r = p.range();
            const checked = r.start === value.start && r.end === value.end;
            return (
              <DropdownMenuItem
                key={p.key}
                role="menuitemradio"
                aria-checked={checked}
                className="pr-8"
                // Stay open: picking a preset is often followed by nudging one
                // endpoint below, and the tick is the confirmation.
                onSelect={(e) => {
                  e.preventDefault();
                  onChange(checked ? { start: '', end: '' } : r);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                {checked && <Check className="absolute right-2 size-4" aria-hidden />}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />
          <div className="space-y-1 px-2 py-1">
            <DateEndpoint
              label={t('filters.dateFrom')}
              value={value.start}
              // Keep the window valid from either end: a start after the current
              // end would match nothing, so it takes the end with it.
              max={value.end || undefined}
              onChange={(start) => onChange({ start, end: value.end })}
            />
            <DateEndpoint
              label={t('filters.dateTo')}
              value={value.end}
              min={value.start || undefined}
              onChange={(end) => onChange({ start: value.start, end })}
            />
          </div>

          {isSet && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onChange({ start: '', end: '' });
                }}
              >
                {t('filters.dateClear')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

/** One labelled endpoint of the range. */
function DateEndpoint({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-xs text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        // The menu's typeahead would otherwise swallow every keystroke, and
        // Space/Enter would pick the row instead of opening the calendar.
        onKeyDown={(e) => e.stopPropagation()}
        className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-xs text-foreground shadow-sm outline-none [color-scheme:light] focus-visible:ring-1 focus-visible:ring-ring dark:[color-scheme:dark]"
      />
    </label>
  );
}

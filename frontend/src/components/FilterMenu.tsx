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

export interface FilterCategory {
  id: string;
  label: string;
  icon?: ReactNode;
  options: FilterOption[];
  /** Show a type-to-filter box — worth it for long lists like people. */
  searchable?: boolean;
}

/** categoryId → selected option ids. Absent/empty = that filter is off. */
export type FilterSelections = Record<string, string[]>;

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

  const toggle = (categoryId: string, optionId: string) => {
    const current = value[categoryId] ?? [];
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    const merged = { ...value, [categoryId]: next };
    if (next.length === 0) delete merged[categoryId];
    onChange(merged);
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
        {categories.map((cat) => (
          <CategorySub
            key={cat.id}
            category={cat}
            selected={value[cat.id] ?? []}
            onToggle={(optionId) => toggle(cat.id, optionId)}
          />
        ))}
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
  category: FilterCategory;
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

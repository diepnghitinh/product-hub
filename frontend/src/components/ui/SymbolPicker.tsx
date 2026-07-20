import { useMemo, useState } from 'react';
import { TeamSymbol } from '@/components/TeamSymbol';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Input } from './Input';

export interface SymbolPickerProps {
  /** The chosen symbol's stored name. */
  value: string;
  /** Accent for the symbol; null means it inherits its surroundings. */
  color?: string | null;
  options: readonly string[];
  /** Palette for the colour dot. Omit to hide the dot entirely. */
  colors?: readonly string[];
  onChange: (patch: { icon?: string; color?: string | null }) => void;
  /** The footer's "use the default symbol" action. */
  reset?: { label: string; icon: string };
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** `boxed` is a standalone form control; `plain` sits inline (nav, headings). */
  variant?: 'boxed' | 'plain';
  size?: number;
}

/**
 * Picks a team's symbol and accent: a searchable grid of icons with a colour
 * dot, and a footer that puts the symbol back to its issue type's default.
 */
export function SymbolPicker({
  value,
  color,
  options,
  colors,
  onChange,
  reset,
  ariaLabel,
  disabled,
  className,
  variant = 'boxed',
  size = 16,
}: SymbolPickerProps) {
  // Controlled: the cells are plain buttons, not DropdownMenuItems, so Radix
  // won't dismiss on select — and a menu left open keeps `pointer-events: none`
  // on <body>, swallowing the next click on the page.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [colorsOpen, setColorsOpen] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((n) => n.includes(q)) : options;
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setColorsOpen(false);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) close();
      }}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'grid shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            variant === 'boxed'
              ? 'size-9 border border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-background'
              : 'size-6 text-current hover:bg-foreground/10 hover:ring-1 hover:ring-border',
            className,
          )}
        >
          <TeamSymbol name={value} size={size} color={color ?? undefined} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuPortal>
        <DropdownMenuContent align="start" className="w-[326px] p-0">
          {/* Header: the section name, and a reset for the whole symbol. */}
          <div className="flex items-center justify-between border-b px-3">
            <span className="-mb-px border-b-2 border-foreground py-2.5 text-sm font-medium text-foreground">
              {t('teams.iconTab')}
            </span>
            <button
              type="button"
              className="py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                onChange({ icon: reset?.icon, color: null });
                close();
              }}
            >
              {t('common.reset')}
            </button>
          </div>

          <div className="flex items-center gap-2 p-3">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              aria-label={t('common.search')}
              className="h-9 flex-1"
            />
            {colors && colors.length > 0 && (
              <button
                type="button"
                aria-label={t('teams.color')}
                aria-expanded={colorsOpen}
                onClick={() => setColorsOpen((v) => !v)}
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-md border border-input transition-colors hover:bg-accent',
                  colorsOpen && 'bg-accent',
                )}
              >
                <span
                  className="size-4 rounded-full border"
                  style={{ background: color ?? 'transparent' }}
                />
              </button>
            )}
          </div>

          {colorsOpen && colors && (
            <div className="grid grid-cols-9 gap-1 border-b px-3 pb-3">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={c === color}
                  onClick={() => {
                    onChange({ color: c });
                    setColorsOpen(false);
                  }}
                  className={cn(
                    'grid size-6 place-items-center rounded-md transition-transform hover:scale-110',
                    c === color && 'ring-2 ring-ring ring-offset-1 ring-offset-popover',
                  )}
                >
                  <span className="size-4 rounded-full" style={{ background: c }} />
                </button>
              ))}
            </div>
          )}

          <div className="max-h-[260px] overflow-y-auto px-3 pb-3">
            {shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('common.noResults')}
              </p>
            ) : (
              <div className="grid grid-cols-9 gap-1">
                {shown.map((name) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={name === value}
                    onClick={() => {
                      onChange({ icon: name });
                      close();
                    }}
                    className={cn(
                      'grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      name === value && 'bg-accent text-foreground ring-1 ring-primary',
                    )}
                  >
                    <TeamSymbol name={name} size={16} color={color ?? undefined} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {reset && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 border-t px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => {
                onChange({ icon: reset.icon });
                close();
              }}
            >
              <TeamSymbol name={reset.icon} size={14} />
              {reset.label}
            </button>
          )}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}

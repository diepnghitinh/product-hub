import { cn } from '@/lib/utils';

/**
 * The per-browser preferences that live in the profile menu rather than on a
 * settings page: theme and language. Neither is an account field — changing one
 * on a shared machine never changes what a teammate sees.
 *
 * Both render as {@link PrefRow}: label left, a small segmented control right,
 * one line each. They used to be stacked blocks with a title above a full-width
 * switch, which made the profile menu taller than the thing it was attached to.
 */

export interface PrefOption<T extends string> {
  value: T;
  /** Shown when there's room; always the accessible name. */
  label: string;
  /** Drawn instead of the label when `iconOnly` — keeps the control narrow. */
  glyph?: React.ReactNode;
}

/**
 * One preference, one line. `iconOnly` trades the labels for glyphs, which is
 * what keeps a row narrow enough to sit beside its own title in a 256px popover;
 * the label survives as the tooltip and the accessible name either way.
 */
export function PrefRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  iconOnly = false,
}: {
  label: string;
  /** Consequence that isn't obvious from pressing it (language reloads the
   *  page). Carried as the control's tooltip instead of a line of copy. */
  hint?: string;
  value: T;
  options: PrefOption<T>[];
  onChange: (value: T) => void;
  iconOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</span>
      <div
        className="inline-flex shrink-0 rounded-md bg-muted p-0.5"
        role="group"
        aria-label={label}
        title={hint}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            aria-label={iconOnly ? opt.label : undefined}
            title={iconOnly ? opt.label : undefined}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-[5px] text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              iconOnly ? 'size-6' : 'px-2 py-1',
              value === opt.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {iconOnly ? opt.glyph : opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

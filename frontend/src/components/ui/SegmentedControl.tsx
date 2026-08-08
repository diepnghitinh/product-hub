import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Visible text, and the accessible name when the labels are hidden. */
  label: string;
  /** Small leading glyph. Pass it already sized — the control doesn't force a
   *  size, so each caller keeps the scale its row is set in. */
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** `md` (default) sits in a board toolbar; `sm` in a compact one. */
  size?: 'sm' | 'md';
  /**
   * `sm-up` drops the labels below the `sm` breakpoint and leaves the icons, for
   * a control sharing a cramped row (the topbar) on a phone. The label stays as
   * the accessible name and becomes the tooltip, so nothing is lost — but only
   * pass it when every option has an icon.
   */
  labels?: 'always' | 'sm-up';
  /** Names the group for screen readers — say what's being chosen ("View"). */
  'aria-label'?: string;
  className?: string;
}

/**
 * One choice out of a few, as a row of joined segments — the toggle group the
 * app kept hand-rolling (the boards' Task|Bug switch, the docs hub's Mine|All,
 * the roadmaps' Cards|Timeline). Active segment takes the brand fill.
 *
 * **This is not a view switch by default.** A board's view switch is `ViewTabs`
 * — the underlined sub-header strip. Reach for this only where that strip is
 * already spoken for by something else (the planning page spends it on
 * Roadmaps|OKRs, so a *second* strip beneath it would read as two rows of tabs
 * with no hierarchy between them), or where the choice narrows a list rather
 * than reframing the page.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  labels = 'always',
  'aria-label': ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5',
        className,
      )}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            // Only when the label is hidden, so a visible one isn't shadowed by
            // a tooltip repeating it.
            title={labels === 'sm-up' ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'sm' ? 'text-xs' : 'text-sm',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon && <span className="grid shrink-0 place-items-center">{o.icon}</span>}
            {/* sr-only takes it out of flow, so the flex gap collapses with it
                and an icon-only segment stays square. */}
            <span className={cn(labels === 'sm-up' && 'sr-only sm:not-sr-only')}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

import { cn } from '@/lib/utils';

interface ProgressBarProps {
  /** 0–100. Clamped. */
  value: number;
  className?: string;
  /**
   * Render as `<span>`s instead of `<div>`s, for the places a bar sits *inside*
   * something that only accepts phrasing content — a `<button>`, a `<span>`.
   *
   * It exists so those places can use this component rather than hand-rolling a
   * track and a fill out of spans, which is how a second progress palette gets
   * born: the copy drifts, and suddenly "50%" is one colour on the item page and
   * another on the calendar. Same tokens, same shape, legal markup.
   */
  inline?: boolean;
}

/**
 * A thin progress track — the app's ONE progress bar.
 *
 * Track `secondary`, fill `primary`, everywhere: project completion, coverage,
 * an item's Progress %, a calendar bar's mini meter. The fill deliberately does
 * **not** take the colour of whatever it sits on — a percentage that changes
 * colour per row stops reading as a percentage and starts reading as a category.
 */
export function ProgressBar({ value, className = '', inline = false }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const Track = inline ? 'span' : 'div';
  const Fill = inline ? 'span' : 'div';
  return (
    <Track
      className={cn(
        'block h-2 w-full overflow-hidden rounded-full bg-secondary',
        className,
      )}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <Fill
        className="block h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </Track>
  );
}

import { cn } from '@/lib/utils';

interface ProgressBarProps {
  /** 0–100. Clamped. */
  value: number;
  className?: string;
}

/** A thin progress track — used for project completion and coverage bars. */
export function ProgressBar({ value, className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

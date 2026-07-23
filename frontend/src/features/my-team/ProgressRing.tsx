import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  /** Filled share, 0–100. */
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Centre content; defaults to `${value}%`. */
  children?: ReactNode;
}

/**
 * A small SVG donut for "share complete" — the ring on each workload card. The
 * arc is the brand `--primary`; the track is a faint tint of it, so the component
 * introduces no new colour (per the design rules). Rotated -90° so it fills from
 * 12 o'clock clockwise.
 */
export function ProgressRing({
  value,
  size = 48,
  strokeWidth = 5,
  className,
  children,
}: ProgressRingProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - v / 100);
  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${v}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-primary/15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[11px] font-semibold tabular-nums text-foreground">
        {children ?? `${v}%`}
      </div>
    </div>
  );
}

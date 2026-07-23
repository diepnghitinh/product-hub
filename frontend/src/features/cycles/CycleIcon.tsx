import { CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one cycle glyph, used everywhere a cycle is represented — the board banner,
 * the toolbar chip, the issue's Cycle property, and the insights modal. It mirrors
 * the sidebar's Current/Upcoming nav icon exactly (a `circle-dot` centred in a
 * `size-5` box), so a cycle reads the same in every surface. `className` tunes the
 * wrapper (e.g. colour) without touching the glyph itself.
 */
export function CycleIcon({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-5 shrink-0 place-items-center', className)}>
      <CircleDot className="size-3.5" aria-hidden />
    </span>
  );
}

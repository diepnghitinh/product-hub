import { useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { TOTAL_WEIGHT, transfer, type WeightItem } from '../weights';

export interface WeightSplitBarItem extends WeightItem {
  title: string;
}

interface WeightSplitBarProps {
  items: WeightSplitBarItem[];
  /** Fired once per gesture, on release — never mid-drag. */
  onChange: (weights: number[]) => void;
  disabled?: boolean;
  className?: string;
}

/** Below these shares a segment is too narrow to read a label in. */
const SHOW_FULL_LABEL = 16;
const SHOW_PCT_ONLY = 8;

/**
 * The split between an objective's key results, as one bar you can drag.
 *
 * Dragging a divider trades weight between the two segments it sits between and
 * leaves the rest alone, so the bar is always exactly full — the "must total
 * 100%" rule is expressed by the shape rather than by a validation message.
 *
 * Every segment is the same brand purple on purpose: they are all the same kind
 * of thing, and it is length that carries the meaning here, not hue. The
 * dividers supply the visual separation.
 */
export function WeightSplitBar({ items, onChange, disabled, className }: WeightSplitBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pending = useRef<number[] | null>(null);
  const [draft, setDraft] = useState<number[] | null>(null);

  if (items.length === 0) return null;

  const weights = draft ?? items.map((i) => i.weight);

  // A divider only moves weight between its own two neighbours, so pinning
  // either side freezes it.
  const movable = (i: number) => !disabled && !items[i].locked && !items[i + 1].locked;

  function commit(next: number[]) {
    pending.current = null;
    setDraft(null);
    onChange(next);
  }

  function beginDrag(index: number, e: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || !movable(index)) return;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return;

    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    // Measure against the weights as they were when the gesture started, so the
    // result depends only on where the pointer is now — no drift from rounding
    // each intermediate step.
    const base = items.map((i) => i.weight);
    const before = base.slice(0, index).reduce((a, b) => a + b, 0);

    const onMove = (ev: PointerEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * TOTAL_WEIGHT;
      const next = transfer(base, index, pct - before);
      pending.current = next;
      setDraft(next);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      if (pending.current) commit(pending.current);
      else setDraft(null);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }

  function nudge(index: number, delta: number) {
    const base = items.map((i) => i.weight);
    commit(transfer(base, index, base[index] + delta));
  }

  let offset = 0;
  const segments = items.map((item, i) => {
    const seg = { item, index: i, start: offset, width: weights[i] };
    offset += weights[i];
    return seg;
  });

  return (
    <div className={cn('select-none', className)}>
      <div
        ref={trackRef}
        className="relative h-9 w-full overflow-hidden rounded-lg bg-secondary"
        role="group"
        aria-label={t('milestones.weightSplit')}
      >
        {segments.map(({ item, index, start, width }) => (
          <div
            key={item.id}
            className="absolute inset-y-0 flex items-center justify-center gap-1 bg-primary px-1.5"
            style={{ left: `${start}%`, width: `${width}%` }}
            title={`${krLabel(index)} · ${item.title} · ${width}%`}
          >
            {item.locked && width >= SHOW_PCT_ONLY && (
              <Lock className="size-3 shrink-0 text-primary-foreground/80" aria-hidden />
            )}
            {width >= SHOW_FULL_LABEL ? (
              <span className="truncate text-[11px] font-semibold text-primary-foreground">
                {krLabel(index)} · {width}%
              </span>
            ) : width >= SHOW_PCT_ONLY ? (
              <span className="truncate text-[11px] font-semibold text-primary-foreground">
                {width}%
              </span>
            ) : null}
          </div>
        ))}

        {segments.slice(0, -1).map(({ item, index, start, width }) => {
          const at = start + width;
          const canMove = movable(index);
          return (
            <div
              key={`divider-${item.id}`}
              role="separator"
              aria-orientation="vertical"
              aria-label={t('milestones.weightDivider')
                .replace('{left}', krLabel(index))
                .replace('{right}', krLabel(index + 1))}
              aria-valuenow={weights[index]}
              aria-valuemin={0}
              aria-valuemax={weights[index] + weights[index + 1]}
              aria-disabled={!canMove}
              tabIndex={canMove ? 0 : -1}
              className={cn(
                'group absolute inset-y-0 z-10 flex w-4 -translate-x-1/2 justify-center rounded-sm outline-none',
                canMove
                  ? 'cursor-col-resize touch-none focus-visible:ring-2 focus-visible:ring-ring'
                  : 'pointer-events-none',
              )}
              style={{ left: `${at}%` }}
              onPointerDown={(e) => beginDrag(index, e)}
              onKeyDown={(e) => {
                if (!canMove) return;
                const step = e.shiftKey ? 10 : 1;
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  nudge(index, -step);
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  nudge(index, step);
                }
              }}
            >
              {/* The notch is the gap between segments — card-coloured so it reads
                  as space rather than as another mark. */}
              <span className="h-full w-1 bg-card" aria-hidden />
              {canMove && (
                <span
                  className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-card opacity-0 ring-1 ring-primary transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const krLabel = (index: number) => `KR${index + 1}`;

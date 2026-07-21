import type { TaskLabelConfig } from '@/types/enums';
import { cn } from '@/lib/utils';

/**
 * Resolve an item's `labelKeys` against its team's label set, preserving the
 * team's label order (not the item's key order) so chips read consistently
 * everywhere. Keys with no matching label — a label the team later deleted —
 * simply drop out.
 */
export function resolveLabels(
  keys: string[] | undefined,
  labels: TaskLabelConfig[] | undefined,
): TaskLabelConfig[] {
  if (!keys?.length || !labels?.length) return [];
  const set = new Set(keys);
  return labels.filter((l) => set.has(l.key));
}

/**
 * The colour-tinted pills for an item's labels — one product-wide treatment for
 * cards, list rows and read-only detail. Tinted from each label's own colour
 * (the same `color-mix` idiom the board columns use), so it stays legible in
 * light and dark. Renders nothing when there are no resolvable labels.
 */
export function LabelChips({
  keys,
  labels,
  className,
  max,
}: {
  /** The item's `labelKeys`. */
  keys: string[] | undefined;
  /** The owning team's label set (`team.labels`). */
  labels: TaskLabelConfig[] | undefined;
  className?: string;
  /** Cap the chips shown; the rest collapse into a "+N". */
  max?: number;
}) {
  const resolved = resolveLabels(keys, labels);
  if (resolved.length === 0) return null;

  const shown = max ? resolved.slice(0, max) : resolved;
  const extra = resolved.length - shown.length;

  // A <span> (not <div>) so the chips are valid inside the list rows' <button>
  // and <a> wrappers; it's blockified wherever it's a flex child (cards, rows).
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((l) => (
        <span
          key={l.key}
          title={l.name}
          className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none"
          style={{
            color: l.color,
            backgroundColor: `color-mix(in srgb, ${l.color} 14%, transparent)`,
          }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: l.color }}
            aria-hidden
          />
          <span className="truncate">{l.name}</span>
        </span>
      ))}
      {extra > 0 && <span className="shrink-0 text-[11px] text-muted-foreground">+{extra}</span>}
    </span>
  );
}

import { TEAM_COLORS } from '@/types/enums';
import { cn } from '@/lib/utils';

/**
 * A tag's colour, derived from the word itself: the same tag is the same colour
 * on a hub card, in the filter row and in a doc's rail, with nothing stored and
 * no migration. Free-text tags carry no colour of their own — unlike team
 * labels, which the team picks colours for (`LabelChips`).
 *
 * Case-insensitive, to match how tags are deduped and filtered, and drawn from
 * the workspace palette this page already tints doc icons with, so the hub never
 * shows a colour that isn't the product's.
 */
export function docTagColor(tag: string): string {
  const key = tag.toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TEAM_COLORS[hash % TEAM_COLORS.length];
}

interface DocTagChipProps {
  tag: string;
  /**
   * Present = the chip toggles a filter: renders a <button>, carries
   * `aria-pressed`, and gets a bigger tap target. Absent = a static label.
   */
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

/**
 * One tag, tinted from its own colour with the `color-mix` idiom the board
 * columns and label chips use — legible in light and dark without a second
 * palette. Selected chips deepen the tint and take a ring in the tag's colour,
 * so the active filter reads without relying on colour alone.
 */
export function DocTagChip({ tag, onClick, selected = false, className }: DocTagChipProps) {
  const color = docTagColor(tag);
  const style = {
    color,
    backgroundColor: `color-mix(in srgb, ${color} ${selected ? 22 : 12}%, transparent)`,
    ...(selected ? { boxShadow: `inset 0 0 0 1px ${color}` } : null),
  };
  const dot = (
    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
  );

  if (!onClick) {
    return (
      <span
        title={tag}
        style={style}
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
          className,
        )}
      >
        {dot}
        <span className="truncate">{tag}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={style}
      className={cn(
        // Roomier than the static chip: this one gets tapped.
        'inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium leading-none transition-[background-color,box-shadow] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 dark:hover:brightness-110',
        className,
      )}
    >
      {dot}
      <span className="truncate">{tag}</span>
    </button>
  );
}

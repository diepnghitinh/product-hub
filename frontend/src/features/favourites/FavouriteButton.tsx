import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { FavouriteKind } from '@/types/enums';
import { useFavouriteToggle } from './api';

interface FavouriteButtonProps {
  kind: FavouriteKind;
  /** Canonical id of the entity (bug/task uuid, or roadmap item id). */
  refId: string;
  /** Entity title — seeds the optimistic sidebar row. */
  title: string;
  /** Required for roadmap items (which board the item lives in). */
  roadmapId?: string;
  /** Star glyph size in px. */
  size?: number;
  /** Extra classes on the button box (e.g. to match a neighbouring control). */
  className?: string;
}

/**
 * A star toggle that pins / unpins an entity to the sidebar favourites — reused
 * in the bug & task detail header and the roadmap item dialog. Filled and brand-
 * coloured when active, a quiet outline otherwise. Optimistic, so it flips at
 * once (see `useFavouriteToggle`).
 */
export function FavouriteButton({
  kind,
  refId,
  title,
  roadmapId,
  size = 18,
  className,
}: FavouriteButtonProps) {
  const { active, toggle, isPending } = useFavouriteToggle(kind, refId, { roadmapId, title });
  const label = active ? t('fav.remove') : t('fav.add');
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
        active && 'text-primary hover:text-primary',
        className,
      )}
    >
      <Star size={size} className={cn(active && 'fill-current')} aria-hidden />
    </button>
  );
}

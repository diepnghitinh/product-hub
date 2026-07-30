import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TEAM_COLORS } from '@/types/enums';

/**
 * A person's own colour, derived from who they are: the same person is the same
 * colour in every list they appear in, with nothing stored and no migration.
 * Seeded by user id when there is one (names get edited, ids don't), falling back
 * to the name so a person known only by name still gets a stable colour.
 *
 * Drawn from `TEAM_COLORS` — the workspace palette team icons and doc tags are
 * already tinted from — so an avatar never shows a colour that isn't the
 * product's. Same hash as `docTagColor`.
 */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TEAM_COLORS[hash % TEAM_COLORS.length];
}

/**
 * A person shown as their avatar image, falling back to initials on a branded
 * disc when they have no photo (or it fails to load — Radix swaps in the fallback
 * automatically). One component so every avatar in the app reads the same: pass
 * `className` for the size, `fallbackClassName` for the initials' text size to
 * match it (the disc has no intrinsic type scale).
 *
 * `tint` swaps the brand disc for the person's own {@link avatarColor} — opt-in,
 * for lists where telling people apart at a glance *is* the job (the assignee
 * picker). Everywhere else a single avatar identifies one person already, and the
 * brand disc keeps the app's colour discipline.
 */
export function UserAvatar({
  name,
  email = '',
  src,
  tint = false,
  seed,
  className,
  fallbackClassName,
}: {
  name: string;
  email?: string;
  src?: string | null;
  /** Colour the initials disc per-person instead of brand primary. */
  tint?: boolean;
  /** What the tint hashes — pass the user id; defaults to the name. */
  seed?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const color = tint ? avatarColor(seed || name || email) : undefined;
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={name} className="object-cover" /> : null}
      <AvatarFallback
        // Deepened a shade so white initials clear contrast on the lighter half
        // of the palette (amber, violet) — the `color-mix` idiom the board
        // columns and tag chips already tint with.
        style={color ? { backgroundColor: `color-mix(in srgb, ${color} 82%, black)` } : undefined}
        className={cn(
          'font-semibold',
          color ? 'text-white' : 'bg-primary text-primary-foreground',
          fallbackClassName,
        )}
      >
        {initials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}

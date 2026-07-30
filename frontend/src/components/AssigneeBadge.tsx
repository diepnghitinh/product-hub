import { Badge } from '@/components/ui';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import type { IssueAssigneeDto } from '@/types/dto';

/** How many faces fit before the rest collapse into the `+N`. */
const MAX_FACES = 3;

/**
 * Who's on an issue — the read-only twin of {@link AssigneeField}, for board
 * cards, list rows and the public board. An issue can be shared, so this is the
 * one place that decides how "several people" reads: a stack of tinted initials
 * followed by the primary's name and `+N`, with the full list in the tooltip.
 * Using it everywhere is what keeps a shared issue recognisable on any board.
 *
 * Initials only, never photos: this also renders on the *public* board, where
 * `useUsers` (the only source of `avatarUrl`) isn't readable — a badge that
 * 401s on a share link isn't worth a face. The tint is the person's own
 * {@link avatarColor}, the same colour the picker gives them.
 */
export function AssigneeBadge({
  assignees,
  unassignedLabel,
  className,
}: {
  /** The issue's `assignees`, primary first (`[]` renders `unassignedLabel`). */
  assignees: IssueAssigneeDto[];
  unassignedLabel: string;
  className?: string;
}) {
  if (assignees.length === 0) {
    return (
      <Badge variant="muted" className={cn('max-w-full truncate', className)}>
        {unassignedLabel}
      </Badge>
    );
  }
  const faces = assignees.slice(0, MAX_FACES);
  const extra = assignees.length - 1;
  return (
    <Badge
      variant="muted"
      // Tighter left padding so the first avatar sits where the text used to.
      className={cn('max-w-full gap-1.5 pl-1', className)}
      title={assignees.map((a) => a.name).join(', ')}
    >
      <span className="flex shrink-0 items-center">
        {faces.map((a, i) => (
          <UserAvatar
            key={a.id}
            tint
            seed={a.id}
            name={a.name}
            // The ring is the badge's own background, so overlapping discs read
            // as separate faces rather than one blob.
            className={cn('size-4 ring-2 ring-muted', i > 0 && '-ml-1.5')}
            fallbackClassName="text-[8px]"
          />
        ))}
      </span>
      <span className="truncate">{assignees[0].name}</span>
      {extra > 0 && <span className="shrink-0 tabular-nums opacity-70">+{extra}</span>}
    </Badge>
  );
}

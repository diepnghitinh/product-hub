import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDotDashed,
  CircleSlash,
  CircleX,
  type LucideIcon,
} from 'lucide-react';
import { IssueStatusCategory } from '@/types/enums';
import { cn } from '@/lib/utils';

/**
 * The symbol for a board column, drawn from its **category** and tinted with its
 * own colour.
 *
 * One glyph per category, never per column: that's what makes a board readable
 * at a glance — you can tell "this is in flight" from "this is done" without
 * knowing that a particular team calls it "Dev released". The colour stays the
 * column's own, so a team's palette still comes through.
 *
 * The circle fills as work progresses: empty dashed (backlog) → empty (unstarted)
 * → dashed-with-centre (started) → ticked (completed), then the two ways an issue
 * can close without being delivered.
 */
const CATEGORY_ICON: Record<IssueStatusCategory, LucideIcon> = {
  [IssueStatusCategory.BACKLOG]: CircleDashed,
  [IssueStatusCategory.UNSTARTED]: Circle,
  [IssueStatusCategory.STARTED]: CircleDotDashed,
  [IssueStatusCategory.COMPLETED]: CircleCheck,
  [IssueStatusCategory.CANCELED]: CircleX,
  [IssueStatusCategory.DUPLICATE]: CircleSlash,
};

export function StatusIcon({
  category,
  color,
  className,
}: {
  category: IssueStatusCategory | undefined;
  /** The column's own colour. Omitted = inherits the surrounding text colour. */
  color?: string;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category ?? IssueStatusCategory.UNSTARTED];
  return (
    <Icon
      className={cn('size-4 shrink-0', className)}
      style={color ? { color } : undefined}
      aria-hidden
    />
  );
}

/**
 * The same symbol on the tinted rounded tile the settings list uses — a soft wash
 * of the column's colour behind it, so a long list of statuses still reads as
 * distinct rows rather than a wall of text.
 */
export function StatusIconTile({
  category,
  color,
  className,
}: {
  category: IssueStatusCategory | undefined;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn('grid size-8 shrink-0 place-items-center rounded-lg', className)}
      // A flat alpha wash rather than a token: the colour is the team's own hex,
      // so there is no palette entry to reach for. 20% reads on light and dark.
      style={{ backgroundColor: `${color}33` }}
    >
      <StatusIcon category={category} color={color} />
    </span>
  );
}

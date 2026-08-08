import { AssigneeBadge } from '@/components/AssigneeBadge';
import type { RowPerson } from '../ganttRows';

/**
 * Who's on a timeline row, drawn in the rail beside its title — the same stacked
 * initials + name the boards use, so a person is recognisable wherever their work
 * shows up.
 *
 * **Nobody on it draws nothing.** Every other surface says "Unassigned" out loud
 * because a card has room to; a timeline is a hundred rows tall and most of them
 * would be repeating the same word down the right-hand edge. The gap already
 * reads as "nobody" — and the Assignee filter's own *Unassigned* option is how
 * you go looking for those rows deliberately.
 *
 * Shared by both roadmap timelines (one roadmap, and all of them at once) so the
 * two can't drift into naming people differently.
 */
export function TimelineAssignees({ people }: { people?: RowPerson[] }) {
  if (!people?.length) return null;
  return (
    <AssigneeBadge
      assignees={people}
      // Never reached (the guard above), but the prop is required for the callers
      // that *do* have room to say it.
      unassignedLabel=""
      className="text-[11px] font-normal"
    />
  );
}

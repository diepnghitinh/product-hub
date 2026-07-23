import { UniqueEntityID } from '@core/domain';
import { TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { CustomFieldConfig } from '../enums/custom-field.enums';
import { TeamIssueType, TeamStatusConfig } from '../enums/team.enums';

export interface TeamProps {
  id: UniqueEntityID;
  tenantId: string;
  /** Stable per-tenant slug (`qc`, `engineering`). The name is editable. */
  key: string;
  name: string;
  /** Which issue list this team owns — fixed once created. */
  issueType: TeamIssueType;
  /** The nav symbol. Defaults to the icon for `issueType`. */
  icon: string;
  /** Accent the symbol is drawn in; null means it inherits its surroundings. */
  color: string | null;
  /**
   * The team's own board columns, or undefined when it has never set any (then
   * `statuses` resolves to the type's defaults). Kept raw so the boot migration
   * can tell "never configured" from "configured to the defaults".
   */
  statuses?: TeamStatusConfig[];
  /**
   * The team's own item labels ({@link TaskLabelConfig}: `{key, name, color}`),
   * shared by every task/bug in the team. Unlike statuses there are no built-ins
   * and no defaults — an empty list is a valid, expected state, so this is stored
   * as given (a missing field on an old doc simply reads back as `[]`).
   */
  labels?: TaskLabelConfig[];
  /**
   * The team's own custom fields ({@link CustomFieldConfig}), shared by every
   * task/bug in the team. Like labels there are no built-ins and no defaults —
   * an empty list is a valid, expected state (a missing field reads back as `[]`).
   */
  customFields?: CustomFieldConfig[];
  /**
   * The team's automatic sprint rhythm (see features/cycles.md). Off by default —
   * nothing changes for a team until it opts in. The rhythm fields keep their
   * defaults meaningful even while disabled, so re-enabling picks up where the
   * settings were left.
   */
  cyclesEnabled: boolean;
  /** 1–4 weeks per cycle. */
  cycleLengthWeeks: number;
  /** 0–2 weeks between cycles — a gap with no current cycle at all. */
  cycleCooldownWeeks: number;
  /** Weekday a cycle starts on: 1 = Monday (default) … 7 = Sunday. Fallback
   *  anchor, used only when {@link cycleStartDate} is null. */
  cycleStartDay: number;
  /**
   * Explicit date the cycle loop is anchored to (ISO `YYYY-MM-DD`), or null to
   * fall back to {@link cycleStartDay} in today's week. When set, cycle 1 opens
   * on this date: a future date starts the loop then (nothing current until it
   * arrives); a past date rolls the rhythm forward in whole periods to today's
   * window, never minting the cycles that were skipped.
   */
  cycleStartDate: string | null;
  /** When a cycle ends, unfinished issues move to the next cycle (off: back to no-cycle). */
  cycleAutoRollover: boolean;
  /** Archived teams stay (with their issues) but drop out of the nav. */
  archived: boolean;
  /** Display order in the nav. */
  order: number;
  /** Public read-only share link state. */
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

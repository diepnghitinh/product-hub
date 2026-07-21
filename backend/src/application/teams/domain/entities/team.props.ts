import { UniqueEntityID } from '@core/domain';
import { TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
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

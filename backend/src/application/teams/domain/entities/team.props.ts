import { UniqueEntityID } from '@core/domain';
import { TeamIcon, TeamIssueType, TeamStatusConfig } from '../enums/team.enums';

export interface TeamProps {
  id: UniqueEntityID;
  tenantId: string;
  /** Stable per-tenant slug (`qc`, `engineering`). The name is editable. */
  key: string;
  name: string;
  /** Which issue list this team owns — fixed once created. */
  issueType: TeamIssueType;
  /** The nav symbol. Defaults to the icon for `issueType`. */
  icon: TeamIcon;
  /**
   * The team's own board columns, or undefined when it has never set any (then
   * `statuses` resolves to the type's defaults). Kept raw so the boot migration
   * can tell "never configured" from "configured to the defaults".
   */
  statuses?: TeamStatusConfig[];
  /** Archived teams stay (with their issues) but drop out of the nav. */
  archived: boolean;
  /** Display order in the nav. */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

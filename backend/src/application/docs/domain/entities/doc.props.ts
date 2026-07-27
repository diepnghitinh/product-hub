import { UniqueEntityID } from '@core/domain';

export interface DocProps {
  id: UniqueEntityID;
  tenantId: string;
  title: string;
  /** Symbol shown beside the doc (a `TEAM_ICONS` name); '' falls back to the default. */
  icon: string;
  /** Accent the symbol is drawn in (a `TEAM_COLORS` value); null = inherit. */
  color: string | null;
  /** Optional banner image at the top of the doc ('' when unset). */
  coverUrl: string;
  /** Free-text labels used to group and filter docs on the hub. */
  tags: string[];
  createdBy: string;
  createdByName: string;
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

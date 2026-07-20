import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { TeamIssueType, TeamStatusConfig } from '@application/teams/domain/enums/team.enums';
import { TEAM_ICONS } from '@application/teams/domain/enums/team-icons';

export interface TeamDoc {
  _id: string;
  tenantId: string;
  key: string;
  name: string;
  issueType: TeamIssueType;
  icon?: string;
  color?: string | null;
  statuses?: TeamStatusConfig[];
  archived: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TeamSchema = new Schema<TeamDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    name: { type: String, required: true, maxlength: 60 },
    issueType: { type: String, enum: Object.values(TeamIssueType), required: true },
    // Optional: pre-existing teams resolve their icon from issueType in the entity.
    icon: { type: String, enum: TEAM_ICONS },
    color: { type: String, default: null },
    // Optional: teams stored before per-team statuses resolve defaults in the entity.
    statuses: {
      type: [{ _id: false, key: String, label: String, color: String }],
      default: undefined,
    },
    archived: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// A team's key is its stable per-tenant identity.
TeamSchema.index({ tenantId: 1, key: 1 }, { unique: true });

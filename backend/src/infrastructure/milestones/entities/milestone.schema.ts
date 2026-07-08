import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { MilestoneStatus, ObjectiveData } from '@application/milestones/domain/milestone.types';

export interface MilestoneDoc {
  _id: string;
  tenantId: string;
  title: string;
  timeframe: string;
  status: MilestoneStatus;
  objectives: ObjectiveData[];
  roadmapIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const MilestoneSchema = new Schema<MilestoneDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 160 },
    timeframe: { type: String, default: '' },
    status: { type: String, enum: Object.values(MilestoneStatus), default: MilestoneStatus.ACTIVE },
    objectives: { type: [Schema.Types.Mixed], default: [] } as unknown as ObjectiveData[],
    roadmapIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

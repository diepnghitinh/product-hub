import { UniqueEntityID } from '@core/domain';
import { MilestoneStatus, ObjectiveData } from './milestone.types';

export interface MilestoneProps {
  id: UniqueEntityID;
  tenantId: string;
  title: string;
  timeframe: string;
  status: MilestoneStatus;
  objectives: ObjectiveData[];
  roadmapIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

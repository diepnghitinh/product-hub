import { UniqueEntityID } from '@core/domain';
import { RoadmapItemData } from '../types/roadmap-item.type';

export interface RoadmapProps {
  id: UniqueEntityID;
  tenantId: string;
  projectId: string;
  title: string;
  description: string;
  items: RoadmapItemData[];
  createdAt: Date;
  updatedAt: Date;
}

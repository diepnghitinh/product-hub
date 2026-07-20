import { UniqueEntityID } from '@core/domain';
import { RoadmapColumn, RoadmapItemData } from '../types/roadmap-item.type';

export interface RoadmapProps {
  id: UniqueEntityID;
  tenantId: string;
  projectId: string;
  title: string;
  description: string;
  items: RoadmapItemData[];
  columns: RoadmapColumn[];
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

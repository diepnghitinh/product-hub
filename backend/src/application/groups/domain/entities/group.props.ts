import { UniqueEntityID } from '@core/domain';

export interface GroupProps {
  id: UniqueEntityID;
  tenantId: string;
  projectId: string;
  slug: string;
  title: string;
  /** Position in the project sidebar (ascending). */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

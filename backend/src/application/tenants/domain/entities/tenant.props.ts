import { UniqueEntityID } from '@core/domain';

export interface TenantProps {
  id: UniqueEntityID;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

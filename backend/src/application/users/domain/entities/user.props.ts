import { UniqueEntityID } from '@core/domain';
import { Role } from '@core/interfaces';

export interface UserProps {
  id: UniqueEntityID;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  inboxSeenAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

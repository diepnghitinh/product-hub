import { UniqueEntityID } from '@core/domain';

export interface PlatformAdminProps {
  id: UniqueEntityID;
  email: string;
  name: string;
  passwordHash: string;
  /** A disabled admin keeps their row but can no longer sign in. */
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

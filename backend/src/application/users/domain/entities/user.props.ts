import { UniqueEntityID } from '@core/domain';
import { Role } from '@core/interfaces';
import { FavouriteRef } from '@application/favourites/domain/favourite.ref';

export interface UserProps {
  id: UniqueEntityID;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  inboxSeenAt?: Date | null;
  /** Entities this user has pinned to their sidebar (newest first). */
  favourites: FavouriteRef[];
  /** Keys of inbox notifications this user has read (see GetInboxUseCase). */
  readInboxKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

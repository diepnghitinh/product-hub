import { UniqueEntityID } from '@core/domain';
import { Role } from '@core/interfaces';
import { FavouriteRef } from '@application/favourites/domain/favourite.ref';
import { TaskStatusConfig } from '@application/tasks/domain/enums/task.enums';

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
  /**
   * The columns of this user's *private personal board* (`/tasks/personal`).
   * Owned entirely by the user — unlike team statuses there are no protected
   * built-ins. Seeded from `DEFAULT_TASK_STATUSES` for every account.
   */
  personalStatuses: TaskStatusConfig[];
  /** Keys of inbox notifications this user has read (see GetInboxUseCase). */
  readInboxKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

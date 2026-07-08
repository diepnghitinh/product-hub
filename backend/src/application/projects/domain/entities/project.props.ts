import { UniqueEntityID } from '@core/domain';
import { Environment } from '../enums/environment.enum';

export interface ProjectProps {
  id: UniqueEntityID;
  tenantId: string;
  slug: string;
  title: string;
  subtitle: string;
  owner: string;
  /** Id of the user who created the project (drives ownership). */
  createdBy: string;
  /** User ids granted edit access beyond the creator/admins. */
  sharedWith: string[];
  pinned: boolean;
  environment: Environment;
  /** Public read-only link toggle + token (managed in Phase 5 · Sharing). */
  publicEnabled: boolean;
  publicToken: string | null;
  /** Soft-delete marker — set when archived, cleared on restore. */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

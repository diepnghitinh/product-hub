import { UniqueEntityID } from '@core/domain';

export interface ApiKeyProps {
  id: UniqueEntityID;
  tenantId: string;
  name: string;
  /** SHA-256 of the plaintext key — the plaintext is shown only once, at creation. */
  keyHash: string;
  /** Display prefix (e.g. `phk_ab12…`) for the masked list. */
  prefix: string;
  createdBy: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

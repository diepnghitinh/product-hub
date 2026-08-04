import { UniqueEntityID } from '@core/domain';
import { ApiKeyScope } from './api-key.enums';

export interface ApiKeyProps {
  id: UniqueEntityID;
  tenantId: string;
  name: string;
  /** SHA-256 of the plaintext key — the plaintext is shown only once, at creation. */
  keyHash: string;
  /** Display prefix (e.g. `phk_ab12…`) for the masked list. */
  prefix: string;
  createdBy: string;
  /** What the key may do — the ceiling on write/delete through MCP. */
  scope: ApiKeyScope;
  lastUsedAt: Date | null;
  createdAt: Date;
}

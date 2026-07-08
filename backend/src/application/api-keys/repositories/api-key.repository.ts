import { ApiKeyEntity } from '../domain/api-key.entity';

/** Port for API-key persistence. */
export abstract class IApiKeyRepository {
  findById: (id: string) => Promise<ApiKeyEntity | null>;
  /** Look up a key by its hash (public-API authentication). */
  findByHash: (keyHash: string) => Promise<ApiKeyEntity | null>;
  findByTenant: (tenantId: string) => Promise<ApiKeyEntity[]>;
  save: (key: ApiKeyEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

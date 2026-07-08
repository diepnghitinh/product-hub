import { UserEntity } from '../domain/entities/user.entity';
import { QueryUserDto } from '../dtos/query-user.dto';

export interface UserPaginationResponse {
  data: UserEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Port for user persistence. `findByEmail` / `existsByEmail` are global (email is
 * unique across tenants, so login resolves the tenant from the account); all
 * tenant-scoped reads take an explicit `tenantId`.
 */
export abstract class IUserRepository {
  findById: (id: string) => Promise<UserEntity | null>;
  findByEmail: (email: string) => Promise<UserEntity | null>;
  existsByEmail: (email: string) => Promise<boolean>;
  findByTenant: (
    tenantId: string,
    query: QueryUserDto,
  ) => Promise<UserPaginationResponse>;
  save: (user: UserEntity) => Promise<void>;
  update: (user: UserEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

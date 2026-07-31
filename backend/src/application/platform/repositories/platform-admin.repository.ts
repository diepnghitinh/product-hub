import { PlatformAdminEntity } from '../domain/entities/platform-admin.entity';

/** Port for platform-operator accounts (implemented in infrastructure). */
export abstract class IPlatformAdminRepository {
  findById: (id: string) => Promise<PlatformAdminEntity | null>;
  findByEmail: (email: string) => Promise<PlatformAdminEntity | null>;
  findAll: () => Promise<PlatformAdminEntity[]>;
  countAll: () => Promise<number>;
  save: (admin: PlatformAdminEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

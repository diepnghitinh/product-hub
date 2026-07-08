import { GroupEntity } from '../domain/entities/group.entity';

/**
 * Port for group persistence. Groups are always read in the context of a project;
 * every method is scoped by `tenantId` + `projectId`.
 */
export abstract class IGroupRepository {
  findById: (id: string) => Promise<GroupEntity | null>;
  findByProject: (tenantId: string, projectId: string) => Promise<GroupEntity[]>;
  existsBySlug: (
    tenantId: string,
    projectId: string,
    slug: string,
  ) => Promise<boolean>;
  countByProject: (tenantId: string, projectId: string) => Promise<number>;
  save: (group: GroupEntity) => Promise<void>;
  update: (group: GroupEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

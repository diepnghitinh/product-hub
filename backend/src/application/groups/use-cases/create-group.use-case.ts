import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { uniqueSlug } from '@module-shared/utils/slug.util';
import { IProjectRepository } from '@application/projects/repositories/project.repository';
import { CreateGroupDto } from '../dtos/create-group.dto';
import { GroupEntity } from '../domain/entities/group.entity';
import { IGroupRepository } from '../repositories/group.repository';

export interface CreateGroupRequest {
  tenantId: string;
  projectId: string;
  dto: CreateGroupDto;
}

@Injectable()
export class CreateGroupUseCase
  implements IUsecaseExecute<CreateGroupRequest, Result<GroupEntity>>
{
  constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    tenantId,
    projectId,
    dto,
  }: CreateGroupRequest): Promise<Result<GroupEntity>> {
    const project = await this.projects.findById(projectId);
    if (!project || project.tenantId !== tenantId) {
      return Result.fail('Project not found');
    }

    const slug = await uniqueSlug(dto.title, (candidate) =>
      this.groups.existsBySlug(tenantId, projectId, candidate),
    );
    const order = await this.groups.countByProject(tenantId, projectId);

    const created = GroupEntity.create({
      tenantId,
      projectId,
      slug,
      title: dto.title,
      order,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const group = created.getValue();
    await this.groups.save(group);
    return Result.ok(group);
  }
}

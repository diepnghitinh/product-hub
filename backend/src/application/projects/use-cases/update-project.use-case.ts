import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UpdateProjectDto } from '../dtos/update-project.dto';
import { ProjectEntity } from '../domain/entities/project.entity';
import { IProjectRepository } from '../repositories/project.repository';

export interface UpdateProjectRequest {
  id: string;
  tenantId: string;
  dto: UpdateProjectDto;
}

@Injectable()
export class UpdateProjectUseCase
  implements IUsecaseExecute<UpdateProjectRequest, Result<ProjectEntity>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    id,
    tenantId,
    dto,
  }: UpdateProjectRequest): Promise<Result<ProjectEntity>> {
    const project = await this.projects.findById(id);
    if (!project || project.tenantId !== tenantId) {
      return Result.fail('Project not found');
    }

    if (dto.title !== undefined) project.rename(dto.title);
    if (dto.subtitle !== undefined) project.setSubtitle(dto.subtitle);
    if (dto.owner !== undefined) project.setOwner(dto.owner);
    if (dto.environment !== undefined) project.setEnvironment(dto.environment);
    if (dto.pinned !== undefined) project.setPinned(dto.pinned);

    await this.projects.update(project);
    return Result.ok(project);
  }
}

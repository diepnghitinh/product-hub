import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ProjectEntity } from '../domain/entities/project.entity';
import { IProjectRepository } from '../repositories/project.repository';

export interface ArchiveProjectRequest {
  id: string;
  tenantId: string;
}

/** Soft-delete: sets `deletedAt`, hiding the project from normal listings. */
@Injectable()
export class ArchiveProjectUseCase
  implements IUsecaseExecute<ArchiveProjectRequest, Result<ProjectEntity>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    id,
    tenantId,
  }: ArchiveProjectRequest): Promise<Result<ProjectEntity>> {
    const project = await this.projects.findById(id);
    if (!project || project.tenantId !== tenantId) {
      return Result.fail('Project not found');
    }
    project.archive();
    await this.projects.update(project);
    return Result.ok(project);
  }
}

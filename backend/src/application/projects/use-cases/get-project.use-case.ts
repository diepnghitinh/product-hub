import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ProjectEntity } from '../domain/entities/project.entity';
import { IProjectRepository } from '../repositories/project.repository';

export interface GetProjectRequest {
  id: string;
  tenantId: string;
}

@Injectable()
export class GetProjectUseCase
  implements IUsecaseExecute<GetProjectRequest, Result<ProjectEntity>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({ id, tenantId }: GetProjectRequest): Promise<Result<ProjectEntity>> {
    const project = await this.projects.findById(id);
    if (!project || project.tenantId !== tenantId) {
      return Result.fail('Project not found');
    }
    return Result.ok(project);
  }
}

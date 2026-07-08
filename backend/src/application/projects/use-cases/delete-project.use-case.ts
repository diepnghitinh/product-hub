import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IProjectRepository } from '../repositories/project.repository';

export interface DeleteProjectRequest {
  id: string;
  tenantId: string;
}

/** Permanent delete — used from the Archive screen (admin only). */
@Injectable()
export class DeleteProjectUseCase
  implements IUsecaseExecute<DeleteProjectRequest, Result<void>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({ id, tenantId }: DeleteProjectRequest): Promise<Result<void>> {
    const project = await this.projects.findById(id);
    if (!project || project.tenantId !== tenantId) {
      return Result.fail('Project not found');
    }
    await this.projects.delete(id);
    return Result.ok();
  }
}

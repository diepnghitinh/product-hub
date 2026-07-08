import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ProjectEntity } from '../domain/entities/project.entity';
import { IProjectRepository } from '../repositories/project.repository';

export interface SetProjectSharingRequest {
  id: string;
  tenantId: string;
  enabled: boolean;
}

/** Toggle a project's public read-only link, minting a token when enabling. */
@Injectable()
export class SetProjectSharingUseCase
  implements IUsecaseExecute<SetProjectSharingRequest, Result<ProjectEntity>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    id,
    tenantId,
    enabled,
  }: SetProjectSharingRequest): Promise<Result<ProjectEntity>> {
    const project = await this.projects.findById(id);
    if (!project || project.tenantId !== tenantId) {
      return Result.fail('Project not found');
    }
    if (enabled) {
      project.enableSharing(project.publicToken ?? uuid());
    } else {
      project.disableSharing();
    }
    await this.projects.update(project);
    return Result.ok(project);
  }
}

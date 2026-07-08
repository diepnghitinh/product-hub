import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { uniqueSlug } from '@module-shared/utils/slug.util';
import { ProjectEntity } from '../domain/entities/project.entity';
import { IProjectRepository } from '../repositories/project.repository';

export interface RestoreProjectRequest {
  id: string;
  tenantId: string;
}

/** Bring an archived project back. Re-derives a fresh unique slug if the old one
 * was taken by an active project in the meantime. */
@Injectable()
export class RestoreProjectUseCase
  implements IUsecaseExecute<RestoreProjectRequest, Result<ProjectEntity>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    id,
    tenantId,
  }: RestoreProjectRequest): Promise<Result<ProjectEntity>> {
    const project = await this.projects.findById(id);
    if (!project || project.tenantId !== tenantId) {
      return Result.fail('Project not found');
    }
    if (!project.isArchived) {
      return Result.fail('Project is not archived');
    }

    if (await this.projects.existsBySlug(tenantId, project.slug)) {
      const slug = await uniqueSlug(project.title, (candidate) =>
        this.projects.existsBySlug(tenantId, candidate),
      );
      project.setSlug(slug);
    }

    project.restore();
    await this.projects.update(project);
    return Result.ok(project);
  }
}

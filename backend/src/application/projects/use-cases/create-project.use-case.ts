import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { uniqueSlug } from '@module-shared/utils/slug.util';
import { CreateProjectDto } from '../dtos/create-project.dto';
import { ProjectEntity } from '../domain/entities/project.entity';
import { IProjectRepository } from '../repositories/project.repository';

export interface CreateProjectRequest {
  tenantId: string;
  /** Creator identity — id for ownership, name for the default owner label. */
  userId: string;
  userName: string;
  dto: CreateProjectDto;
}

@Injectable()
export class CreateProjectUseCase
  implements IUsecaseExecute<CreateProjectRequest, Result<ProjectEntity>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    tenantId,
    userId,
    userName,
    dto,
  }: CreateProjectRequest): Promise<Result<ProjectEntity>> {
    const slug = await uniqueSlug(dto.title, (candidate) =>
      this.projects.existsBySlug(tenantId, candidate),
    );

    const created = ProjectEntity.create({
      tenantId,
      slug,
      title: dto.title,
      subtitle: dto.subtitle,
      owner: dto.owner || userName,
      createdBy: userId,
      environment: dto.environment,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const project = created.getValue();
    await this.projects.save(project);
    return Result.ok(project);
  }
}

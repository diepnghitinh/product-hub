import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { uniqueSlug } from '@module-shared/utils/slug.util';
import { IProjectRepository } from '@application/projects/repositories/project.repository';
import { CreateReportDto } from '../dtos/create-report.dto';
import { ReportEntity } from '../domain/entities/report.entity';
import { IReportRepository } from '../repositories/report.repository';

export interface CreateReportRequest {
  tenantId: string;
  projectId: string;
  dto: CreateReportDto;
}

@Injectable()
export class CreateReportUseCase
  implements IUsecaseExecute<CreateReportRequest, Result<ReportEntity>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
  ) {}

  async execute({
    tenantId,
    projectId,
    dto,
  }: CreateReportRequest): Promise<Result<ReportEntity>> {
    const project = await this.projects.findById(projectId);
    if (!project || project.tenantId !== tenantId) {
      return Result.fail('Project not found');
    }

    const slug = await uniqueSlug(dto.label || dto.title, (candidate) =>
      this.reports.existsBySlug(tenantId, projectId, candidate),
    );
    const order = await this.reports.countByProject(tenantId, projectId);

    const created = ReportEntity.create({
      tenantId,
      projectId,
      groupId: dto.groupId,
      slug,
      title: dto.title,
      label: dto.label,
      statusVariant: dto.statusVariant,
      order,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const report = created.getValue();
    await this.reports.save(report);
    return Result.ok(report);
  }
}

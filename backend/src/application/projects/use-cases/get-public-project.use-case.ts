import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IReportRepository } from '@application/reports/repositories/report.repository';
import { ReportEntity } from '@application/reports/domain/entities/report.entity';
import { ProjectEntity } from '../domain/entities/project.entity';
import { IProjectRepository } from '../repositories/project.repository';

export interface PublicProjectResult {
  project: ProjectEntity;
  reports: ReportEntity[];
}

/** Resolve a public share token into a read-only project + its reports. */
@Injectable()
export class GetPublicProjectUseCase
  implements IUsecaseExecute<{ token: string }, Result<PublicProjectResult>>
{
  constructor(
    @Inject(IProjectRepository) private readonly projects: IProjectRepository,
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({ token }: { token: string }): Promise<Result<PublicProjectResult>> {
    const project = await this.projects.findByPublicToken(token);
    if (!project) return Result.fail('This link is not available');
    const reports = await this.reports.findByProject(
      project.tenantId,
      project.id.toString(),
    );
    return Result.ok({ project, reports });
  }
}

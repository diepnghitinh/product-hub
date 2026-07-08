import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import {
  IReportRepository,
  ProjectReportStats,
} from '../repositories/report.repository';

export interface GetProjectStatsRequest {
  tenantId: string;
  projectIds: string[];
}

/** Batch report rollups for a set of projects (Dashboard cards + Overview). */
@Injectable()
export class GetProjectStatsUseCase
  implements IUsecaseExecute<GetProjectStatsRequest, Result<ProjectReportStats[]>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({
    tenantId,
    projectIds,
  }: GetProjectStatsRequest): Promise<Result<ProjectReportStats[]>> {
    if (projectIds.length === 0) return Result.ok([]);
    const stats = await this.reports.statsForProjects(tenantId, projectIds);
    return Result.ok(stats);
  }
}

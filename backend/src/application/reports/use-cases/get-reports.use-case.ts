import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ReportEntity } from '../domain/entities/report.entity';
import { IReportRepository } from '../repositories/report.repository';

export interface GetReportsRequest {
  tenantId: string;
  projectId: string;
  groupId?: string;
}

@Injectable()
export class GetReportsUseCase
  implements IUsecaseExecute<GetReportsRequest, Result<ReportEntity[]>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({
    tenantId,
    projectId,
    groupId,
  }: GetReportsRequest): Promise<Result<ReportEntity[]>> {
    const reports = await this.reports.findByProject(tenantId, projectId, groupId);
    return Result.ok(reports);
  }
}

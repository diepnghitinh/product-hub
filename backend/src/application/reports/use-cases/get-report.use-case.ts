import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ReportEntity } from '../domain/entities/report.entity';
import { IReportRepository } from '../repositories/report.repository';

export interface GetReportRequest {
  id: string;
  tenantId: string;
  projectId: string;
}

@Injectable()
export class GetReportUseCase
  implements IUsecaseExecute<GetReportRequest, Result<ReportEntity>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({
    id,
    tenantId,
    projectId,
  }: GetReportRequest): Promise<Result<ReportEntity>> {
    const report = await this.reports.findById(id);
    if (!report || report.tenantId !== tenantId || report.projectId !== projectId) {
      return Result.fail('Report not found');
    }
    return Result.ok(report);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ReportEntity } from '../domain/entities/report.entity';
import { IReportRepository } from '../repositories/report.repository';

export interface ReorderReportsRequest {
  tenantId: string;
  projectId: string;
  ids: string[];
}

@Injectable()
export class ReorderReportsUseCase
  implements IUsecaseExecute<ReorderReportsRequest, Result<ReportEntity[]>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({
    tenantId,
    projectId,
    ids,
  }: ReorderReportsRequest): Promise<Result<ReportEntity[]>> {
    const reports = await this.reports.findByProject(tenantId, projectId);
    const byId = new Map(reports.map((r) => [r.id.toString(), r]));

    let order = 0;
    for (const id of ids) {
      const report = byId.get(id);
      if (!report) continue;
      report.setOrder(order);
      await this.reports.update(report);
      order += 1;
    }

    const updated = await this.reports.findByProject(tenantId, projectId);
    return Result.ok(updated);
  }
}

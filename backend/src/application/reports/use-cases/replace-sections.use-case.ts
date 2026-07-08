import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ReportEntity } from '../domain/entities/report.entity';
import { ReportSection } from '../domain/types/section.types';
import { IReportRepository } from '../repositories/report.repository';

export interface ReplaceSectionsRequest {
  id: string;
  tenantId: string;
  projectId: string;
  sections: ReportSection[];
}

@Injectable()
export class ReplaceSectionsUseCase
  implements IUsecaseExecute<ReplaceSectionsRequest, Result<ReportEntity>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({
    id,
    tenantId,
    projectId,
    sections,
  }: ReplaceSectionsRequest): Promise<Result<ReportEntity>> {
    const report = await this.reports.findById(id);
    if (!report || report.tenantId !== tenantId || report.projectId !== projectId) {
      return Result.fail('Report not found');
    }
    report.replaceSections(sections);
    await this.reports.update(report);
    return Result.ok(report);
  }
}

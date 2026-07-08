import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IReportRepository } from '../repositories/report.repository';

export interface DeleteReportRequest {
  id: string;
  tenantId: string;
  projectId: string;
}

@Injectable()
export class DeleteReportUseCase
  implements IUsecaseExecute<DeleteReportRequest, Result<void>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({
    id,
    tenantId,
    projectId,
  }: DeleteReportRequest): Promise<Result<void>> {
    const report = await this.reports.findById(id);
    if (!report || report.tenantId !== tenantId || report.projectId !== projectId) {
      return Result.fail('Report not found');
    }
    await this.reports.delete(id);
    return Result.ok();
  }
}

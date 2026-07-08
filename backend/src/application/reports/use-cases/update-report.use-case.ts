import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UpdateReportDto } from '../dtos/update-report.dto';
import { ReportEntity } from '../domain/entities/report.entity';
import { IReportRepository } from '../repositories/report.repository';

export interface UpdateReportRequest {
  id: string;
  tenantId: string;
  projectId: string;
  dto: UpdateReportDto;
}

@Injectable()
export class UpdateReportUseCase
  implements IUsecaseExecute<UpdateReportRequest, Result<ReportEntity>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({
    id,
    tenantId,
    projectId,
    dto,
  }: UpdateReportRequest): Promise<Result<ReportEntity>> {
    const report = await this.reports.findById(id);
    if (!report || report.tenantId !== tenantId || report.projectId !== projectId) {
      return Result.fail('Report not found');
    }

    if (dto.title !== undefined) report.rename(dto.title);
    report.applyMeta(dto);

    await this.reports.update(report);
    return Result.ok(report);
  }
}

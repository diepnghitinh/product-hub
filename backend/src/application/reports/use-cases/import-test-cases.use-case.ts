import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ImportTestCasesDto } from '../dtos/import-test-cases.dto';
import { normalizeCases } from '../services/normalize-case';
import { IReportRepository } from '../repositories/report.repository';

export interface ImportTestCasesRequest {
  id: string;
  tenantId: string;
  projectId: string;
  dto: ImportTestCasesDto;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  totalRows: number;
}

@Injectable()
export class ImportTestCasesUseCase
  implements IUsecaseExecute<ImportTestCasesRequest, Result<ImportResult>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
  ) {}

  async execute({
    id,
    tenantId,
    projectId,
    dto,
  }: ImportTestCasesRequest): Promise<Result<ImportResult>> {
    const report = await this.reports.findById(id);
    if (!report || report.tenantId !== tenantId || report.projectId !== projectId) {
      return Result.fail('Report not found');
    }

    const rows = dto.cases ?? [];
    const { cases, skipped } = normalizeCases(rows);
    report.importCases(cases);
    await this.reports.update(report);

    return Result.ok({ imported: cases.length, skipped, totalRows: rows.length });
  }
}

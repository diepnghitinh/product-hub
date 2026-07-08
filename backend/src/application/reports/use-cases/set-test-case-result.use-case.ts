import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { AuditLogEntity } from '@application/audit-log/domain/entities/audit-log.entity';
import { AuditActor, AuditEntity } from '@application/audit-log/domain/enums/audit.enums';
import { IAuditLogRepository } from '@application/audit-log/repositories/audit-log.repository';
import { TestResult } from '../domain/enums/test-result.enum';
import { ReportEntity } from '../domain/entities/report.entity';
import { IReportRepository } from '../repositories/report.repository';

export interface SetTestCaseResultRequest {
  tenantId: string;
  projectId: string;
  /** Locate the case by its shortId (scoped to the project). */
  shortId: string;
  result: TestResult;
  actor: { type: AuditActor; id: string; name: string };
}

/**
 * Set a single test case's result and audit the change. A no-op (same value) is
 * intentionally not audited so polling CI doesn't spam History.
 */
@Injectable()
export class SetTestCaseResultUseCase
  implements IUsecaseExecute<SetTestCaseResultRequest, Result<ReportEntity>>
{
  constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
    @Inject(IAuditLogRepository) private readonly audit: IAuditLogRepository,
  ) {}

  async execute({
    tenantId,
    projectId,
    shortId,
    result,
    actor,
  }: SetTestCaseResultRequest): Promise<Result<ReportEntity>> {
    const report = await this.reports.findByCaseShortId(tenantId, projectId, shortId);
    if (!report) {
      return Result.fail('Test case not found');
    }

    const outcome = report.setResultByShortId(shortId, result);
    if (!outcome.changed) {
      // No-op — return the report without writing or auditing.
      return Result.ok(report);
    }

    await this.reports.update(report);

    const entry = AuditLogEntity.create({
      tenantId,
      projectId,
      reportId: report.id.toString(),
      entity: AuditEntity.TESTCASE,
      entityRef: `${shortId}${outcome.area ? ` · ${outcome.area}` : ''}`,
      field: 'result',
      oldValue: outcome.oldValue ?? '',
      newValue: outcome.newValue ?? result,
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
    });
    if (entry.isSuccess) await this.audit.append(entry.getValue());

    return Result.ok(report);
  }
}

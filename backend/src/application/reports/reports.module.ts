import { Module } from '@nestjs/common';
import { InfrastructureReportsModule } from '@infrastructure/reports/reports.module';
import { InfrastructureProjectsModule } from '@infrastructure/projects/projects.module';
import { ApplicationAuditLogModule } from '@application/audit-log/audit-log.module';
import {
  CreateReportUseCase,
  GetReportsUseCase,
  GetReportUseCase,
  UpdateReportUseCase,
  ReplaceSectionsUseCase,
  ReorderReportsUseCase,
  DeleteReportUseCase,
  ImportTestCasesUseCase,
  SetTestCaseResultUseCase,
  GetProjectStatsUseCase,
} from './use-cases';

const useCases = [
  CreateReportUseCase,
  GetReportsUseCase,
  GetReportUseCase,
  UpdateReportUseCase,
  ReplaceSectionsUseCase,
  ReorderReportsUseCase,
  DeleteReportUseCase,
  ImportTestCasesUseCase,
  SetTestCaseResultUseCase,
  GetProjectStatsUseCase,
];

@Module({
  imports: [
    InfrastructureReportsModule,
    InfrastructureProjectsModule,
    // ApplicationAuditLogModule re-exports the audit-log infra (port) for set-result.
    ApplicationAuditLogModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationReportsModule {}

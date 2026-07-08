import { Module } from '@nestjs/common';
import { ApplicationReportsModule } from '@application/reports/reports.module';
import { ReportsController } from './reports.controller';
import { ProjectStatsController } from './project-stats.controller';

@Module({
  imports: [ApplicationReportsModule],
  controllers: [ReportsController, ProjectStatsController],
})
export class ReportsPresentationModule {}

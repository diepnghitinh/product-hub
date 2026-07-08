import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IReportRepository } from '@application/reports/repositories/report.repository';
import { ReportSchema } from './entities/report.schema';
import { ReportRepository } from './repositories/report.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Report', schema: ReportSchema }])],
  providers: [{ provide: IReportRepository, useClass: ReportRepository }],
  exports: [IReportRepository],
})
export class InfrastructureReportsModule {}

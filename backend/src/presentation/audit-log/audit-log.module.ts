import { Module } from '@nestjs/common';
import { ApplicationAuditLogModule } from '@application/audit-log/audit-log.module';
import { AuditLogController } from './audit-log.controller';

@Module({
  imports: [ApplicationAuditLogModule],
  controllers: [AuditLogController],
})
export class AuditLogPresentationModule {}

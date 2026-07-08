import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IAuditLogRepository } from '@application/audit-log/repositories/audit-log.repository';
import { AuditLogSchema } from './entities/audit-log.schema';
import { AuditLogRepository } from './repositories/audit-log.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'AuditLog', schema: AuditLogSchema }])],
  providers: [{ provide: IAuditLogRepository, useClass: AuditLogRepository }],
  exports: [IAuditLogRepository],
})
export class InfrastructureAuditLogModule {}

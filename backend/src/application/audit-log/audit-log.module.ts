import { Module } from '@nestjs/common';
import { InfrastructureAuditLogModule } from '@infrastructure/audit-log/audit-log.module';
import { GetAuditLogUseCase } from './use-cases';

@Module({
  imports: [InfrastructureAuditLogModule],
  providers: [GetAuditLogUseCase],
  // Export the infra module too so other slices (reports) can inject the port.
  exports: [GetAuditLogUseCase, InfrastructureAuditLogModule],
})
export class ApplicationAuditLogModule {}

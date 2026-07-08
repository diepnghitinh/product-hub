import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ITenantRepository } from '@application/tenants/repositories/tenant.repository';
import { TenantSchema } from './entities/tenant.schema';
import { TenantRepository } from './repositories/tenant.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Tenant', schema: TenantSchema }])],
  providers: [{ provide: ITenantRepository, useClass: TenantRepository }],
  exports: [ITenantRepository],
})
export class InfrastructureTenantsModule {}

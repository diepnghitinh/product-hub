import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IPlatformAdminRepository } from '@application/platform/repositories/platform-admin.repository';
import { IPlanRepository } from '@application/platform/repositories/plan.repository';
import { ISubscriptionRepository } from '@application/platform/repositories/subscription.repository';
import { IPlatformUsageRepository } from '@application/platform/repositories/platform-usage.repository';
import { PlatformAdminSchema } from './entities/platform-admin.schema';
import { PlanSchema } from './entities/plan.schema';
import { SubscriptionSchema } from './entities/subscription.schema';
import { PlatformAdminRepository } from './repositories/platform-admin.repository';
import { PlanRepository } from './repositories/plan.repository';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { PlatformUsageRepository } from './repositories/platform-usage.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'PlatformAdmin', schema: PlatformAdminSchema },
      { name: 'Plan', schema: PlanSchema },
      { name: 'Subscription', schema: SubscriptionSchema },
    ]),
  ],
  providers: [
    { provide: IPlatformAdminRepository, useClass: PlatformAdminRepository },
    { provide: IPlanRepository, useClass: PlanRepository },
    { provide: ISubscriptionRepository, useClass: SubscriptionRepository },
    // Counts straight off the app's own collections — no model registration needed.
    { provide: IPlatformUsageRepository, useClass: PlatformUsageRepository },
  ],
  exports: [
    IPlatformAdminRepository,
    IPlanRepository,
    ISubscriptionRepository,
    IPlatformUsageRepository,
  ],
})
export class InfrastructurePlatformModule {}

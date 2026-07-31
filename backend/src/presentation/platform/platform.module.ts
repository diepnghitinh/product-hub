import { Module } from '@nestjs/common';
import { ApplicationPlatformModule } from '@application/platform/platform.module';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformPlansController } from './platform-plans.controller';
import { PlatformSubscriptionsController } from './platform-subscriptions.controller';

/**
 * Everything under `/v1/platform` — the vendor console's API.
 *
 * Mounted with a `platform` prefix in {@link PresentationModule}, so the tenant
 * app and this share a process but never a URL space.
 */
@Module({
  imports: [ApplicationPlatformModule],
  controllers: [
    PlatformAuthController,
    PlatformTenantsController,
    PlatformPlansController,
    PlatformSubscriptionsController,
  ],
})
export class PlatformPresentationModule {}

import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { InfrastructurePlatformModule } from '@infrastructure/platform/platform.module';
import { InfrastructureTenantsModule } from '@infrastructure/tenants/tenants.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { platformJwtConstants } from './constants';
import { PlatformJwtStrategy } from './services/platform-jwt.strategy';
import { EntitlementService } from './services/entitlement.service';
import {
  ChangePlatformPasswordUseCase,
  GetPlatformAdminUseCase,
  LoginPlatformAdminUseCase,
} from './use-cases/platform-auth.use-cases';
import {
  CreatePlanUseCase,
  DeletePlanUseCase,
  GetPlanUseCase,
  ListPlansUseCase,
  UpdatePlanUseCase,
} from './use-cases/plan.use-cases';
import {
  CancelSubscriptionUseCase,
  GetTenantSubscriptionUseCase,
  ListSubscriptionsUseCase,
  RemoveSubscriptionUseCase,
  UpsertSubscriptionUseCase,
} from './use-cases/subscription.use-cases';
import {
  CreateTenantUseCase,
  GetPlatformOverviewUseCase,
  GetTenantDetailUseCase,
  ListTenantsUseCase,
  SetTenantStatusUseCase,
  UpdateTenantUseCase,
} from './use-cases/platform-tenant.use-cases';

const useCases = [
  LoginPlatformAdminUseCase,
  GetPlatformAdminUseCase,
  ChangePlatformPasswordUseCase,
  ListPlansUseCase,
  GetPlanUseCase,
  CreatePlanUseCase,
  UpdatePlanUseCase,
  DeletePlanUseCase,
  ListSubscriptionsUseCase,
  GetTenantSubscriptionUseCase,
  UpsertSubscriptionUseCase,
  CancelSubscriptionUseCase,
  RemoveSubscriptionUseCase,
  ListTenantsUseCase,
  GetTenantDetailUseCase,
  CreateTenantUseCase,
  UpdateTenantUseCase,
  SetTenantStatusUseCase,
  GetPlatformOverviewUseCase,
];

/**
 * The vendor's own console — everything under `/v1/platform`.
 *
 * It registers a *second* JWT setup beside the tenant one: its own secret and
 * its own passport strategy (`platform-jwt`). That separation is the whole
 * security model here — a workspace token can't be replayed against these
 * endpoints, and a platform token can't be replayed against the tenant API.
 *
 * It reaches into the tenants/users/teams modules because creating a workspace
 * from the console must produce exactly what self-serve registration produces.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: platformJwtConstants.secret,
      signOptions: {
        expiresIn: platformJwtConstants.expiresIn as JwtSignOptions['expiresIn'],
      },
    }),
    InfrastructurePlatformModule,
    InfrastructureTenantsModule,
    InfrastructureUsersModule,
    ApplicationTeamsModule,
  ],
  providers: [PlatformJwtStrategy, EntitlementService, ...useCases],
  exports: [...useCases, EntitlementService],
})
export class ApplicationPlatformModule {}

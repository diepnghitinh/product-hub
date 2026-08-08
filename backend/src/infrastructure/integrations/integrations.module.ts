import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IClickUpSync } from '@application/integrations/clickup-sync.port';
import { ClickUpClient } from '@application/integrations/domain/clickup.client';
import { IClickUpLinkRepository } from '@application/integrations/repositories/clickup-link.repository';
import { IClickUpSyncRepository } from '@application/integrations/repositories/clickup-sync.repository';
import { InfrastructureAppSettingsModule } from '@infrastructure/app-settings/app-settings.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { ClickUpLinkSchema } from './entities/clickup-link.schema';
import { ClickUpSyncSchema } from './entities/clickup-sync.schema';
import { ClickUpLinkRepository } from './repositories/clickup-link.repository';
import { ClickUpSyncRepository } from './repositories/clickup-sync.repository';
import { ClickUpSyncService } from './clickup-sync.service';

/**
 * Persistence for the integrations that need their own collection, plus the one
 * adapter that pushes work out to ClickUp.
 *
 * Only ClickUp needs either today: the git integrations store their whole config
 * on the app-settings singleton and write their result onto issues.
 *
 * `ClickUpSyncService` lives here rather than in the application integrations
 * module for the reason its port explains — that module already imports issues
 * and roadmaps, so they cannot import it back. This module imports neither, so
 * both can import *it*, and the cycle never forms.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'ClickUpLink', schema: ClickUpLinkSchema },
      { name: 'ClickUpSync', schema: ClickUpSyncSchema },
    ]),
    // The token and the connection live on app-settings; assignees are matched
    // to ClickUp members by the email on the user.
    InfrastructureAppSettingsModule,
    InfrastructureUsersModule,
  ],
  providers: [
    { provide: IClickUpLinkRepository, useClass: ClickUpLinkRepository },
    { provide: IClickUpSyncRepository, useClass: ClickUpSyncRepository },
    ClickUpClient,
    { provide: IClickUpSync, useClass: ClickUpSyncService },
  ],
  // `ClickUpClient` is exported rather than provided twice: the application
  // module's use-cases and this module's sync service must be the same client,
  // or the next thing it grows (a rate-limit budget, a circuit breaker) would
  // silently be kept in duplicate.
  exports: [IClickUpLinkRepository, IClickUpSyncRepository, IClickUpSync, ClickUpClient],
})
export class InfrastructureIntegrationsModule {}

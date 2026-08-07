import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IClickUpLinkRepository } from '@application/integrations/repositories/clickup-link.repository';
import { ClickUpLinkSchema } from './entities/clickup-link.schema';
import { ClickUpLinkRepository } from './repositories/clickup-link.repository';

/**
 * Persistence for the integrations that need their own collection.
 *
 * Only ClickUp does today: the git integrations store their whole config on the
 * app-settings singleton and write their result onto issues, so they never
 * needed one.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: 'ClickUpLink', schema: ClickUpLinkSchema }])],
  providers: [{ provide: IClickUpLinkRepository, useClass: ClickUpLinkRepository }],
  exports: [IClickUpLinkRepository],
})
export class InfrastructureIntegrationsModule {}

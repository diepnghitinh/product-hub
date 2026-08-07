import { Module } from '@nestjs/common';
import { ApplicationIntegrationsModule } from '@application/integrations/integrations.module';
import { ClickUpLinksController } from './clickup-links.controller';

/**
 * Integration routes that belong to the *work*, not to settings.
 *
 * Settings → ClickUp lives under `app-settings` with the other admin-only
 * credential screens; linking a task is something anyone editing an issue does,
 * so it sits here on its own gate.
 */
@Module({
  imports: [ApplicationIntegrationsModule],
  controllers: [ClickUpLinksController],
})
export class IntegrationsPresentationModule {}

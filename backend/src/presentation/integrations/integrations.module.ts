import { Module } from '@nestjs/common';
import { ApplicationIntegrationsModule } from '@application/integrations/integrations.module';
import { ClickUpLinksController } from './clickup-links.controller';
import { ClickUpSyncController } from './clickup-sync.controller';

/**
 * Integration routes that belong to the *work*, not to settings.
 *
 * Settings → ClickUp lives under `app-settings` with the other admin-only
 * credential screens; linking a task is something anyone editing an issue does,
 * so it sits here on its own gate.
 *
 * Board bindings sit here too, admin-gated, for a different reason: they're
 * edited from a *team's* settings page and a roadmap's own menu, not from the
 * one global ClickUp screen, so they follow the board rather than the credential.
 */
@Module({
  imports: [ApplicationIntegrationsModule],
  controllers: [ClickUpLinksController, ClickUpSyncController],
})
export class IntegrationsPresentationModule {}

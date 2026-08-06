import { Module } from '@nestjs/common';
import { ApplicationAppSettingsModule } from '@application/app-settings/app-settings.module';
import { ApplicationIntegrationsModule } from '@application/integrations/integrations.module';
import { AppSettingsController } from './app-settings.controller';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [ApplicationAppSettingsModule, ApplicationIntegrationsModule],
  controllers: [AppSettingsController, IntegrationsController],
})
export class AppSettingsPresentationModule {}

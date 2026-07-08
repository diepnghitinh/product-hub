import { Module } from '@nestjs/common';
import { ApplicationAppSettingsModule } from '@application/app-settings/app-settings.module';
import { AppSettingsController } from './app-settings.controller';

@Module({
  imports: [ApplicationAppSettingsModule],
  controllers: [AppSettingsController],
})
export class AppSettingsPresentationModule {}

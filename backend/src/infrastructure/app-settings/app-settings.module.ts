import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { AppSettingsSchema } from './entities/app-settings.schema';
import { AppSettingsRepository } from './repositories/app-settings.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'AppSettings', schema: AppSettingsSchema }])],
  providers: [{ provide: IAppSettingsRepository, useClass: AppSettingsRepository }],
  exports: [IAppSettingsRepository],
})
export class InfrastructureAppSettingsModule {}

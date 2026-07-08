import { Module } from '@nestjs/common';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { ActivityController } from './activity.controller';

@Module({
  imports: [ApplicationActivityModule],
  controllers: [ActivityController],
})
export class ActivityPresentationModule {}

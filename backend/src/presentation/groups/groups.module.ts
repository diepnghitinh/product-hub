import { Module } from '@nestjs/common';
import { ApplicationGroupsModule } from '@application/groups/groups.module';
import { GroupsController } from './groups.controller';

@Module({
  imports: [ApplicationGroupsModule],
  controllers: [GroupsController],
})
export class GroupsPresentationModule {}

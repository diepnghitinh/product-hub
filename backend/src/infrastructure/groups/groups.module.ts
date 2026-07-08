import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IGroupRepository } from '@application/groups/repositories/group.repository';
import { GroupSchema } from './entities/group.schema';
import { GroupRepository } from './repositories/group.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Group', schema: GroupSchema }])],
  providers: [{ provide: IGroupRepository, useClass: GroupRepository }],
  exports: [IGroupRepository],
})
export class InfrastructureGroupsModule {}

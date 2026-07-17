import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { TeamSchema } from './entities/team.schema';
import { TeamRepository } from './repositories/team.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Team', schema: TeamSchema }])],
  providers: [{ provide: ITeamRepository, useClass: TeamRepository }],
  exports: [ITeamRepository],
})
export class InfrastructureTeamsModule {}

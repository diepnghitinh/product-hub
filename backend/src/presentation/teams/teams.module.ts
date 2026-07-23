import { Module } from '@nestjs/common';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { ApplicationCyclesModule } from '@application/cycles/cycles.module';
import { TeamsController } from './teams.controller';
import { TeamCyclesController } from './team-cycles.controller';

@Module({
  imports: [ApplicationTeamsModule, ApplicationCyclesModule],
  controllers: [TeamsController, TeamCyclesController],
})
export class TeamsPresentationModule {}

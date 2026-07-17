import { Module } from '@nestjs/common';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { TeamsController } from './teams.controller';

@Module({
  imports: [ApplicationTeamsModule],
  controllers: [TeamsController],
})
export class TeamsPresentationModule {}

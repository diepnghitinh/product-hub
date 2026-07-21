import { Module } from '@nestjs/common';
import { InfrastructureTeamsModule } from '@infrastructure/teams/teams.module';
import {
  CreateTeamUseCase,
  EnsureDefaultTeamsUseCase,
  GetTeamsUseCase,
  UpdateTeamUseCase,
  UpdateTeamStatusesUseCase,
  UpdateTeamLabelsUseCase,
  SetTeamSharingUseCase,
  GetPublicTeamUseCase,
} from './use-cases/team.use-cases';

const useCases = [
  GetTeamsUseCase,
  CreateTeamUseCase,
  UpdateTeamUseCase,
  UpdateTeamStatusesUseCase,
  UpdateTeamLabelsUseCase,
  EnsureDefaultTeamsUseCase,
  SetTeamSharingUseCase,
  GetPublicTeamUseCase,
];

@Module({
  imports: [InfrastructureTeamsModule],
  providers: [...useCases],
  exports: [...useCases, InfrastructureTeamsModule],
})
export class ApplicationTeamsModule {}

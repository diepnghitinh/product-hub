import { Module } from '@nestjs/common';
import { InfrastructureTeamsModule } from '@infrastructure/teams/teams.module';
import {
  CreateTeamUseCase,
  EnsureDefaultTeamsUseCase,
  GetTeamsUseCase,
  UpdateTeamUseCase,
  UpdateTeamStatusesUseCase,
} from './use-cases/team.use-cases';

const useCases = [
  GetTeamsUseCase,
  CreateTeamUseCase,
  UpdateTeamUseCase,
  UpdateTeamStatusesUseCase,
  EnsureDefaultTeamsUseCase,
];

@Module({
  imports: [InfrastructureTeamsModule],
  providers: [...useCases],
  exports: [...useCases, InfrastructureTeamsModule],
})
export class ApplicationTeamsModule {}

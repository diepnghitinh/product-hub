import { Module } from '@nestjs/common';
import { InfrastructureTasksModule } from '@infrastructure/tasks/tasks.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { InfrastructureTeamsModule } from '@infrastructure/teams/teams.module';
import {
  CreateTaskUseCase,
  GetTasksUseCase,
  GetTaskUseCase,
  UpdateTaskUseCase,
  SetTaskStatusUseCase,
  DeleteTaskUseCase,
} from './use-cases';

const useCases = [
  CreateTaskUseCase,
  GetTasksUseCase,
  GetTaskUseCase,
  UpdateTaskUseCase,
  SetTaskStatusUseCase,
  DeleteTaskUseCase,
];

@Module({
  // Tasks resolve assignee names (users).
  // New tasks land in the workspace's task team.
  imports: [InfrastructureTasksModule, InfrastructureUsersModule, InfrastructureTeamsModule],
  providers: [...useCases],
  exports: [...useCases, InfrastructureTasksModule],
})
export class ApplicationTasksModule {}

import { Module } from '@nestjs/common';
import { InfrastructureTasksModule } from '@infrastructure/tasks/tasks.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
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
  imports: [InfrastructureTasksModule, InfrastructureUsersModule],
  providers: [...useCases],
  exports: [...useCases, InfrastructureTasksModule],
})
export class ApplicationTasksModule {}

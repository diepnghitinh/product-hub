import { Module } from '@nestjs/common';
import { InfrastructureActivityModule } from '@infrastructure/activity/activity.module';
import { InfrastructureBugsModule } from '@infrastructure/bugs/bugs.module';
import { InfrastructureTasksModule } from '@infrastructure/tasks/tasks.module';
import {
  GetCommentsUseCase,
  CreateCommentUseCase,
  UpdateCommentUseCase,
  DeleteCommentUseCase,
  GetTaskCommentsUseCase,
  CreateTaskCommentUseCase,
  UpdateTaskCommentUseCase,
  DeleteTaskCommentUseCase,
} from './use-cases';

const useCases = [
  GetCommentsUseCase,
  CreateCommentUseCase,
  UpdateCommentUseCase,
  DeleteCommentUseCase,
  GetTaskCommentsUseCase,
  CreateTaskCommentUseCase,
  UpdateTaskCommentUseCase,
  DeleteTaskCommentUseCase,
];

@Module({
  imports: [InfrastructureActivityModule, InfrastructureBugsModule, InfrastructureTasksModule],
  providers: [...useCases],
  // Re-export the comment infra so the inbox slice can read mentions.
  exports: [...useCases, InfrastructureActivityModule],
})
export class ApplicationActivityModule {}

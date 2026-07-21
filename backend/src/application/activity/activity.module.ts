import { Module } from '@nestjs/common';
import { InfrastructureActivityModule } from '@infrastructure/activity/activity.module';
import { InfrastructureBugsModule } from '@infrastructure/bugs/bugs.module';
import { InfrastructureTasksModule } from '@infrastructure/tasks/tasks.module';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import { InfrastructureWebhooksModule } from '@infrastructure/webhooks/webhooks.module';
import {
  GetCommentsUseCase,
  CreateCommentUseCase,
  UpdateCommentUseCase,
  DeleteCommentUseCase,
  GetTaskCommentsUseCase,
  CreateTaskCommentUseCase,
  UpdateTaskCommentUseCase,
  DeleteTaskCommentUseCase,
  GetRoadmapItemCommentsUseCase,
  CreateRoadmapItemCommentUseCase,
  UpdateRoadmapItemCommentUseCase,
  DeleteRoadmapItemCommentUseCase,
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
  GetRoadmapItemCommentsUseCase,
  CreateRoadmapItemCommentUseCase,
  UpdateRoadmapItemCommentUseCase,
  DeleteRoadmapItemCommentUseCase,
];

@Module({
  imports: [
    InfrastructureActivityModule,
    InfrastructureBugsModule,
    InfrastructureTasksModule,
    InfrastructureRoadmapsModule,
    InfrastructureWebhooksModule,
  ],
  providers: [...useCases],
  // Re-export the comment infra so the inbox slice can read mentions.
  exports: [...useCases, InfrastructureActivityModule],
})
export class ApplicationActivityModule {}

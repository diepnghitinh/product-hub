import { Module } from '@nestjs/common';
import { InfrastructureActivityModule } from '@infrastructure/activity/activity.module';
import { InfrastructureBugsModule } from '@infrastructure/bugs/bugs.module';
import {
  GetCommentsUseCase,
  CreateCommentUseCase,
  UpdateCommentUseCase,
  DeleteCommentUseCase,
} from './use-cases';

const useCases = [
  GetCommentsUseCase,
  CreateCommentUseCase,
  UpdateCommentUseCase,
  DeleteCommentUseCase,
];

@Module({
  imports: [InfrastructureActivityModule, InfrastructureBugsModule],
  providers: [...useCases],
  // Re-export the comment infra so the inbox slice can read mentions.
  exports: [...useCases, InfrastructureActivityModule],
})
export class ApplicationActivityModule {}

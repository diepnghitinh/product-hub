import { Module } from '@nestjs/common';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
import { InfrastructureActivityModule } from '@infrastructure/activity/activity.module';
import {
  GetInboxUseCase,
  MarkInboxSeenUseCase,
  MarkInboxItemReadUseCase,
} from './use-cases';

const useCases = [GetInboxUseCase, MarkInboxSeenUseCase, MarkInboxItemReadUseCase];

@Module({
  // Inbox is a read model over users + bugs + comments (no store of its own).
  imports: [InfrastructureUsersModule, InfrastructureIssuesModule, InfrastructureActivityModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationInboxModule {}

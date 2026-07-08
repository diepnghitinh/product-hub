import { Module } from '@nestjs/common';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { InfrastructureBugsModule } from '@infrastructure/bugs/bugs.module';
import { InfrastructureActivityModule } from '@infrastructure/activity/activity.module';
import { GetInboxUseCase, MarkInboxSeenUseCase } from './use-cases';

const useCases = [GetInboxUseCase, MarkInboxSeenUseCase];

@Module({
  // Inbox is a read model over users + bugs + comments (no store of its own).
  imports: [InfrastructureUsersModule, InfrastructureBugsModule, InfrastructureActivityModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationInboxModule {}

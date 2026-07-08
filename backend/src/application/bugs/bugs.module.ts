import { Module } from '@nestjs/common';
import { InfrastructureBugsModule } from '@infrastructure/bugs/bugs.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { InfrastructureWebhooksModule } from '@infrastructure/webhooks/webhooks.module';
import {
  CreateBugUseCase,
  GetBugsUseCase,
  GetBugUseCase,
  UpdateBugUseCase,
  SetBugStatusUseCase,
  DeleteBugUseCase,
} from './use-cases';

const useCases = [
  CreateBugUseCase,
  GetBugsUseCase,
  GetBugUseCase,
  UpdateBugUseCase,
  SetBugStatusUseCase,
  DeleteBugUseCase,
];

@Module({
  // Bugs resolve assignee names (users) and fire outbound webhooks (notifier).
  imports: [InfrastructureBugsModule, InfrastructureUsersModule, InfrastructureWebhooksModule],
  providers: [...useCases],
  exports: [...useCases, InfrastructureBugsModule],
})
export class ApplicationBugsModule {}

import { Module } from '@nestjs/common';
import { ApplicationApiKeysModule } from '@application/api-keys/api-keys.module';
import { ApplicationReportsModule } from '@application/reports/reports.module';
import { ApplicationProjectsModule } from '@application/projects/projects.module';
import { ApiKeyGuard } from '@presentation/api-keys/api-key.guard';
import { PublicTestcasesController } from './public-testcases.controller';
import { PublicProjectsController } from './public-projects.controller';

@Module({
  imports: [ApplicationApiKeysModule, ApplicationReportsModule, ApplicationProjectsModule],
  controllers: [PublicTestcasesController, PublicProjectsController],
  providers: [ApiKeyGuard],
})
export class PublicPresentationModule {}

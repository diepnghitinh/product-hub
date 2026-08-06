import { Module } from '@nestjs/common';
import { ApplicationApiKeysModule } from '@application/api-keys/api-keys.module';
import { ApplicationReportsModule } from '@application/reports/reports.module';
import { ApplicationProjectsModule } from '@application/projects/projects.module';
import { ApplicationRoadmapsModule } from '@application/roadmaps/roadmaps.module';
import { ApplicationDocsModule } from '@application/docs/docs.module';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { ApplicationIntegrationsModule } from '@application/integrations/integrations.module';
import { ApiKeyGuard } from '@presentation/api-keys/api-key.guard';
import { PublicTestcasesController } from './public-testcases.controller';
import { PublicProjectsController } from './public-projects.controller';
import { PublicRoadmapsController } from './public-roadmaps.controller';
import { PublicTeamsController } from './public-teams.controller';
import { PublicDocsController } from './public-docs.controller';
import { GitWebhooksController } from './git-webhooks.controller';

@Module({
  imports: [
    ApplicationApiKeysModule,
    ApplicationReportsModule,
    ApplicationProjectsModule,
    ApplicationRoadmapsModule,
    ApplicationDocsModule,
    ApplicationTeamsModule,
    ApplicationIssuesModule,
    ApplicationActivityModule,
    ApplicationIntegrationsModule,
  ],
  controllers: [
    PublicTestcasesController,
    PublicProjectsController,
    PublicRoadmapsController,
    PublicTeamsController,
    PublicDocsController,
    GitWebhooksController,
  ],
  providers: [ApiKeyGuard],
})
export class PublicPresentationModule {}

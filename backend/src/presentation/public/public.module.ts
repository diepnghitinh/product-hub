import { Module } from '@nestjs/common';
import { ApplicationApiKeysModule } from '@application/api-keys/api-keys.module';
import { ApplicationReportsModule } from '@application/reports/reports.module';
import { ApplicationProjectsModule } from '@application/projects/projects.module';
import { ApplicationRoadmapsModule } from '@application/roadmaps/roadmaps.module';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { ApplicationBugsModule } from '@application/bugs/bugs.module';
import { ApplicationTasksModule } from '@application/tasks/tasks.module';
import { ApplicationActivityModule } from '@application/activity/activity.module';
import { ApiKeyGuard } from '@presentation/api-keys/api-key.guard';
import { PublicTestcasesController } from './public-testcases.controller';
import { PublicProjectsController } from './public-projects.controller';
import { PublicRoadmapsController } from './public-roadmaps.controller';
import { PublicTeamsController } from './public-teams.controller';

@Module({
  imports: [
    ApplicationApiKeysModule,
    ApplicationReportsModule,
    ApplicationProjectsModule,
    ApplicationRoadmapsModule,
    ApplicationTeamsModule,
    ApplicationBugsModule,
    ApplicationTasksModule,
    ApplicationActivityModule,
  ],
  controllers: [
    PublicTestcasesController,
    PublicProjectsController,
    PublicRoadmapsController,
    PublicTeamsController,
  ],
  providers: [ApiKeyGuard],
})
export class PublicPresentationModule {}

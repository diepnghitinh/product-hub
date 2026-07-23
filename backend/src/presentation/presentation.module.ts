import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { AuthPresentationModule } from './auth/auth.module';
import { UsersPresentationModule } from './users/users.module';
import { ProjectsPresentationModule } from './projects/projects.module';
import { GroupsPresentationModule } from './groups/groups.module';
import { ReportsPresentationModule } from './reports/reports.module';
import { AuditLogPresentationModule } from './audit-log/audit-log.module';
import { IssuesPresentationModule } from './issues/issues.module';
import { TeamsPresentationModule } from './teams/teams.module';
import { ActivityPresentationModule } from './activity/activity.module';
import { InboxPresentationModule } from './inbox/inbox.module';
import { FavouritesPresentationModule } from './favourites/favourites.module';
import { ReactionsPresentationModule } from './reactions/reactions.module';
import { IssueLinksPresentationModule } from './issue-links/issue-links.module';
import { RoadmapsPresentationModule } from './roadmaps/roadmaps.module';
import { MilestonesPresentationModule } from './milestones/milestones.module';
import { ApiKeysPresentationModule } from './api-keys/api-keys.module';
import { PublicPresentationModule } from './public/public.module';
import { AppSettingsPresentationModule } from './app-settings/app-settings.module';
import { StoragePresentationModule } from './storage/storage.module';

/**
 * Mounts every feature's presentation module at a URL path prefix (routes end up
 * under `/v1/<prefix>` thanks to URI versioning). Add new feature modules here.
 *
 * Groups live under a nested path (`projects/:projectId/groups`), declared on the
 * controller itself, so its module is imported without a RouterModule prefix.
 */
@Module({
  imports: [
    HealthModule,
    AuthPresentationModule,
    UsersPresentationModule,
    ProjectsPresentationModule,
    GroupsPresentationModule,
    ReportsPresentationModule,
    AuditLogPresentationModule,
    IssuesPresentationModule,
    TeamsPresentationModule,
    ActivityPresentationModule,
    InboxPresentationModule,
    FavouritesPresentationModule,
    ReactionsPresentationModule,
    // Controller is @Controller('issue-links') → /v1/issue-links, so no RouterModule prefix.
    IssueLinksPresentationModule,
    RoadmapsPresentationModule,
    MilestonesPresentationModule,
    ApiKeysPresentationModule,
    PublicPresentationModule,
    AppSettingsPresentationModule,
    // Controller is @Controller('uploads') → /v1/uploads, so it's imported like
    // AppSettings (no RouterModule prefix entry needed).
    StoragePresentationModule,
    RouterModule.register([
      { path: 'health', module: HealthModule },
      { path: 'auth', module: AuthPresentationModule },
      { path: 'users', module: UsersPresentationModule },
      { path: 'projects', module: ProjectsPresentationModule },
      { path: 'issues', module: IssuesPresentationModule },
      { path: 'teams', module: TeamsPresentationModule },
      { path: 'roadmaps', module: RoadmapsPresentationModule },
      { path: 'milestones', module: MilestonesPresentationModule },
    ]),
  ],
})
export class PresentationModule {}

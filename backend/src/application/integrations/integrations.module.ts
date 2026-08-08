import { Module } from '@nestjs/common';
import { ApplicationAppSettingsModule } from '@application/app-settings/app-settings.module';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import { InfrastructureIntegrationsModule } from '@infrastructure/integrations/integrations.module';
import { InfrastructureRoadmapsModule } from '@infrastructure/roadmaps/roadmaps.module';
import { InfrastructureTeamsModule } from '@infrastructure/teams/teams.module';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import {
  DeleteIntegrationUseCase,
  RecordPipelineStateUseCase,
  RotateIntegrationSecretUseCase,
  SaveIntegrationUseCase,
} from './use-cases/integration.use-cases';
import {
  ConnectClickUpUseCase,
  DisconnectClickUpUseCase,
  GetClickUpLinksUseCase,
  GetClickUpPeopleUseCase,
  GetClickUpPushTargetUseCase,
  LinkClickUpTaskUseCase,
  ProbeClickUpUseCase,
  PushClickUpTaskUseCase,
  ReceiveClickUpEventUseCase,
  RefreshClickUpLinkUseCase,
  SaveClickUpPeopleUseCase,
  SetClickUpEnabledUseCase,
  UnlinkClickUpTaskUseCase,
} from './use-cases/clickup.use-cases';
import {
  ClickUpScopeColumns,
  DeleteClickUpSyncUseCase,
  GetClickUpListsUseCase,
  GetClickUpListStatusesUseCase,
  GetClickUpSpacesUseCase,
  GetClickUpSyncUseCase,
  SaveClickUpSyncUseCase,
} from './use-cases/clickup-sync.use-cases';

const useCases = [
  SaveIntegrationUseCase,
  RotateIntegrationSecretUseCase,
  DeleteIntegrationUseCase,
  RecordPipelineStateUseCase,
  ProbeClickUpUseCase,
  ConnectClickUpUseCase,
  SetClickUpEnabledUseCase,
  DisconnectClickUpUseCase,
  GetClickUpPeopleUseCase,
  SaveClickUpPeopleUseCase,
  GetClickUpLinksUseCase,
  LinkClickUpTaskUseCase,
  GetClickUpPushTargetUseCase,
  PushClickUpTaskUseCase,
  UnlinkClickUpTaskUseCase,
  RefreshClickUpLinkUseCase,
  ReceiveClickUpEventUseCase,
  GetClickUpSpacesUseCase,
  GetClickUpListsUseCase,
  GetClickUpListStatusesUseCase,
  GetClickUpSyncUseCase,
  SaveClickUpSyncUseCase,
  DeleteClickUpSyncUseCase,
];

/**
 * Integrations sit across the aggregates they touch rather than inside any of
 * them — the config lives on app-settings, git state lands on issues, and a
 * ClickUp link can point at an issue or a roadmap item — so they get their own
 * module rather than being bolted onto one of the three.
 */
@Module({
  imports: [
    ApplicationAppSettingsModule,
    ApplicationIssuesModule,
    InfrastructureIntegrationsModule,
    // Only the repository port — a ClickUp link on a backlog item needs to check
    // the item exists, nothing more. `ApplicationRoadmapsModule` keeps its
    // infrastructure private, and there is no roadmap use-case to call here.
    InfrastructureRoadmapsModule,
    // A team's statuses are the left-hand side of a team board's status map.
    InfrastructureTeamsModule,
    // The people map's left-hand side: our roster, and the emails the automatic
    // match is made on.
    InfrastructureUsersModule,
  ],
  // `ClickUpClient` comes from the infrastructure module, which also hands it to
  // the sync service — one client, one place it's constructed. `ClickUpScopeColumns`
  // is a helper, not a use-case: it's the one place a team's statuses and a
  // roadmap's columns are read as the same thing.
  providers: [ClickUpScopeColumns, ...useCases],
  exports: [...useCases],
})
export class ApplicationIntegrationsModule {}

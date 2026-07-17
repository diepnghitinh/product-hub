import { Module } from '@nestjs/common';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { InfrastructureTenantsModule } from '@infrastructure/tenants/tenants.module';
import { InfrastructureAppSettingsModule } from '@infrastructure/app-settings/app-settings.module';
import { InfrastructureBugsModule } from '@infrastructure/bugs/bugs.module';
import { InfrastructureTasksModule } from '@infrastructure/tasks/tasks.module';
import { TeamsBackfillService } from './services/teams-backfill.service';

/** Seeds QC/Engineering for workspaces that predate Teams and files their
 * existing issues into them. Kept out of `SharedModule` (which is @Global and
 * dependency-free) because it needs the tenant/team/bug/task repositories. */
@Module({
  imports: [
    ApplicationTeamsModule,
    InfrastructureTenantsModule,
    InfrastructureAppSettingsModule,
    InfrastructureBugsModule,
    InfrastructureTasksModule,
  ],
  providers: [TeamsBackfillService],
})
export class TeamsBackfillModule {}

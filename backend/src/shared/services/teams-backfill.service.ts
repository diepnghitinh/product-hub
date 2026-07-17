import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ITenantRepository } from '@application/tenants/repositories/tenant.repository';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { EnsureDefaultTeamsUseCase } from '@application/teams/use-cases/team.use-cases';
import { DEFAULT_TEAMS, TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { IBugRepository } from '@application/bugs/repositories/bug.repository';
import { ITaskRepository } from '@application/tasks/repositories/task.repository';

/**
 * Brings workspaces created before Teams up to date: seeds QC + Engineering,
 * files their existing bugs/tasks into the matching team, and moves the old
 * workspace-wide board columns onto each team.
 *
 * Runs once on boot and is idempotent — seeding skips teams that exist, the
 * issue assignment only touches rows with no `teamId`, and the status migration
 * only touches teams that have none stored yet.
 */
@Injectable()
export class TeamsBackfillService implements OnModuleInit {
  private readonly logger = new Logger(TeamsBackfillService.name);

  constructor(
    @Inject(ITenantRepository) private readonly tenants: ITenantRepository,
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(IBugRepository) private readonly bugs: IBugRepository,
    @Inject(ITaskRepository) private readonly tasks: ITaskRepository,
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
    private readonly ensureTeams: EnsureDefaultTeamsUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const tenantIds = await this.tenants.allIds();
      for (const tenantId of tenantIds) {
        await this.ensureTeams.execute({ tenantId });

        const bugTeam = await this.teams.findByKey(
          tenantId,
          DEFAULT_TEAMS.find((t) => t.issueType === TeamIssueType.BUG)!.key,
        );
        const taskTeam = await this.teams.findByKey(
          tenantId,
          DEFAULT_TEAMS.find((t) => t.issueType === TeamIssueType.TASK)!.key,
        );

        const bugs = bugTeam ? await this.bugs.assignMissingTeam(tenantId, bugTeam.id.toString()) : 0;
        const tasks = taskTeam
          ? await this.tasks.assignMissingTeam(tenantId, taskTeam.id.toString())
          : 0;
        if (bugs || tasks) {
          this.logger.log(`teams backfill: ${bugs} bug(s), ${tasks} task(s) filed for ${tenantId}`);
        }

        await this.migrateStatuses(tenantId);
      }
    } catch (err) {
      // Never block boot — new workspaces still seed teams on registration.
      this.logger.error(`teams backfill failed: ${(err as Error).message}`);
    }
  }

  /**
   * Board columns used to be workspace-wide (`AppSettings.bugStatuses` /
   * `taskStatuses`). Copy them onto each team that has none, so a workspace that
   * customised its columns sees exactly what it saw before. Teams created after
   * this ship already carry their own, and are skipped.
   */
  private async migrateStatuses(tenantId: string): Promise<void> {
    const settings = await this.settings.findByTenant(tenantId);
    if (!settings) return;

    for (const team of await this.teams.findByTenant(tenantId)) {
      if (team.hasOwnStatuses) continue;
      const inherited =
        team.issueType === TeamIssueType.BUG ? settings.bugStatuses : settings.taskStatuses;
      if (!inherited?.length) continue;

      const set = team.setStatuses(inherited);
      if (set.isFailure) {
        // A legacy list missing a built-in would be rejected — leave the team on
        // defaults rather than fail boot.
        this.logger.warn(`statuses for team ${team.key} not migrated: ${set.error as string}`);
        continue;
      }
      await this.teams.save(team);
      this.logger.log(`teams backfill: statuses migrated for ${team.key} (${tenantId})`);
    }
  }
}

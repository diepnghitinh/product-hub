import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { CycleSchedulerService } from '@application/cycles/services/cycle-scheduler.service';
import { QueryIssueDto } from '../dtos/query-issue.dto';
import { ChildRollup } from '../domain/issue-progress';
import { IssuePaginationResponse, IIssueRepository } from '../repositories/issue.repository';

export interface GetIssuesRequest {
  tenantId: string;
  /** The caller — used to scope a `personal` query to their own private board. */
  userId: string;
  query: QueryIssueDto;
}

/** The page, plus the sub-task tally behind each row's percentage — keyed by
 *  issue id, and only holding the rows that actually have children. */
export interface IssueListResult extends IssuePaginationResponse {
  rollups: Record<string, ChildRollup>;
}

@Injectable()
export class GetIssuesUseCase
  implements IUsecaseExecute<GetIssuesRequest, Result<IssueListResult>>
{
  constructor(
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    private readonly cycleScheduler: CycleSchedulerService,
  ) {}

  async execute({ tenantId, userId, query }: GetIssuesRequest): Promise<Result<IssueListResult>> {
    // Cycles are lazy — a team board read is one of the ticks that advances the
    // clock (there is no cron; see CycleSchedulerService). Only reads that name a
    // team pay the team lookup, and only cycles-enabled teams run the scheduler.
    // The `current`/`upcoming`/`none` sentinels resolve here, server-side, which
    // is what keeps saved links like `?cycle=current` stable as cycles roll.
    if (query.teamId) {
      const team = await this.teams.findById(tenantId, query.teamId);
      if (team?.cyclesEnabled) await this.cycleScheduler.ensureCyclesCurrent(team);
      if (team && query.cycleId !== undefined) {
        query.cycleId = await this.cycleScheduler.resolveCycleFilter(team, query.cycleId);
      }
    }

    // A `personal` query returns *only the caller's own* private board — the owner
    // is taken from the token, never the client, so one user can't read another's.
    const result = await this.issues.findByTenant(tenantId, query, {
      personalOwnerId: query.personal ? userId : undefined,
    });

    // One aggregation for the whole page, so every card can draw its "3 of 5
    // done" bar without a count per row. Rows with no children don't come back
    // and map as leaves.
    const rollups = await this.issues.childRollups(
      tenantId,
      result.data.map((i) => i.id.toString()),
    );
    return Result.ok({ ...result, rollups });
  }
}

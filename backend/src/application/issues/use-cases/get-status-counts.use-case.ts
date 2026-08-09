import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IIssueRepository } from '../repositories/issue.repository';

export interface GetStatusCountsRequest {
  tenantId: string;
  /** The team whose board to count. Omit to count the caller's *personal* board. */
  teamId?: string;
  /** The caller — the owner of the personal board when `teamId` is absent. */
  requesterId: string;
}

/**
 * How many issues sit in each column of one board.
 *
 * This is what turns the settings screen from a list of names into something you
 * can act on: "Dev released · 9 issues" says the column is load-bearing, and
 * deleting it is about to move nine pieces of real work somewhere else.
 *
 * A personal board is only ever counted for its own owner — the request carries
 * no user id, it uses the caller's, so there is nothing to tamper with.
 */
@Injectable()
export class GetStatusCountsUseCase
  implements IUsecaseExecute<GetStatusCountsRequest, Result<Record<string, number>>>
{
  constructor(@Inject(IIssueRepository) private readonly issues: IIssueRepository) {}

  async execute({
    tenantId,
    teamId,
    requesterId,
  }: GetStatusCountsRequest): Promise<Result<Record<string, number>>> {
    const counts = await this.issues.countsByStatus(
      tenantId,
      teamId ? { teamId } : { ownerId: requesterId },
    );
    return Result.ok(counts);
  }
}

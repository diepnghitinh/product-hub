import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { QueryIssueDto } from '../dtos/query-issue.dto';
import { IssuePaginationResponse, IIssueRepository } from '../repositories/issue.repository';

export interface GetIssuesRequest {
  tenantId: string;
  /** The caller — used to scope a `personal` query to their own private board. */
  userId: string;
  query: QueryIssueDto;
}

@Injectable()
export class GetIssuesUseCase
  implements IUsecaseExecute<GetIssuesRequest, Result<IssuePaginationResponse>>
{
  constructor(@Inject(IIssueRepository) private readonly issues: IIssueRepository) {}

  async execute({ tenantId, userId, query }: GetIssuesRequest): Promise<Result<IssuePaginationResponse>> {
    // A `personal` query returns *only the caller's own* private board — the owner
    // is taken from the token, never the client, so one user can't read another's.
    const result = await this.issues.findByTenant(tenantId, query, {
      personalOwnerId: query.personal ? userId : undefined,
    });
    return Result.ok(result);
  }
}

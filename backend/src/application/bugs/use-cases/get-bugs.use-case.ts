import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { QueryBugDto } from '../dtos/query-bug.dto';
import { BugPaginationResponse, IBugRepository } from '../repositories/bug.repository';

export interface GetBugsRequest {
  tenantId: string;
  query: QueryBugDto;
}

@Injectable()
export class GetBugsUseCase
  implements IUsecaseExecute<GetBugsRequest, Result<BugPaginationResponse>>
{
  constructor(@Inject(IBugRepository) private readonly bugs: IBugRepository) {}

  async execute({ tenantId, query }: GetBugsRequest): Promise<Result<BugPaginationResponse>> {
    const result = await this.bugs.findByTenant(tenantId, query);
    return Result.ok(result);
  }
}

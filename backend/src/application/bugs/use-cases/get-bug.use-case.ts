import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { BugEntity } from '../domain/entities/bug.entity';
import { IBugRepository } from '../repositories/bug.repository';

export interface GetBugRequest {
  id: string;
  tenantId: string;
}

@Injectable()
export class GetBugUseCase implements IUsecaseExecute<GetBugRequest, Result<BugEntity>> {
  constructor(@Inject(IBugRepository) private readonly bugs: IBugRepository) {}

  async execute({ id, tenantId }: GetBugRequest): Promise<Result<BugEntity>> {
    const bug = await this.bugs.findById(id);
    if (!bug || bug.tenantId !== tenantId) return Result.fail('Bug not found');
    return Result.ok(bug);
  }
}

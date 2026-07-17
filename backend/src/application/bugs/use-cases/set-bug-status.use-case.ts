import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { BugEntity } from '../domain/entities/bug.entity';
import { IBugRepository } from '../repositories/bug.repository';

export interface SetBugStatusRequest {
  id: string;
  tenantId: string;
  status: string;
}

/** Move a bug to another column (Kanban drag). */
@Injectable()
export class SetBugStatusUseCase
  implements IUsecaseExecute<SetBugStatusRequest, Result<BugEntity>>
{
  constructor(@Inject(IBugRepository) private readonly bugs: IBugRepository) {}

  async execute({ id, tenantId, status }: SetBugStatusRequest): Promise<Result<BugEntity>> {
    const bug = await this.bugs.findById(id);
    if (!bug || bug.tenantId !== tenantId) return Result.fail('Bug not found');
    bug.setStatus(status);
    await this.bugs.update(bug);
    return Result.ok(bug);
  }
}

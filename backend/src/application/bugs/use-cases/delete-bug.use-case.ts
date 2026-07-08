import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IBugRepository } from '../repositories/bug.repository';

export interface DeleteBugRequest {
  id: string;
  tenantId: string;
}

@Injectable()
export class DeleteBugUseCase implements IUsecaseExecute<DeleteBugRequest, Result<void>> {
  constructor(@Inject(IBugRepository) private readonly bugs: IBugRepository) {}

  async execute({ id, tenantId }: DeleteBugRequest): Promise<Result<void>> {
    const bug = await this.bugs.findById(id);
    if (!bug || bug.tenantId !== tenantId) return Result.fail('Bug not found');
    await this.bugs.delete(id);
    return Result.ok();
  }
}

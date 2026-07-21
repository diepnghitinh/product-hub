import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IIssueLinkRepository } from '../repositories/issue-link.repository';

export interface DeleteIssueLinkRequest {
  tenantId: string;
  id: string;
}

/** Remove one relationship by link id (tenant-scoped). */
@Injectable()
export class DeleteIssueLinkUseCase
  implements IUsecaseExecute<DeleteIssueLinkRequest, Result<void>>
{
  constructor(@Inject(IIssueLinkRepository) private readonly links: IIssueLinkRepository) {}

  async execute(req: DeleteIssueLinkRequest): Promise<Result<void>> {
    const removed = await this.links.removeById(req.tenantId, req.id);
    if (!removed) return Result.fail('Relation not found');
    return Result.ok();
  }
}

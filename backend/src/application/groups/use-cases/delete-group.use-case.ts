import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IGroupRepository } from '../repositories/group.repository';

export interface DeleteGroupRequest {
  id: string;
  tenantId: string;
  projectId: string;
}

@Injectable()
export class DeleteGroupUseCase
  implements IUsecaseExecute<DeleteGroupRequest, Result<void>>
{
  constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  async execute({
    id,
    tenantId,
    projectId,
  }: DeleteGroupRequest): Promise<Result<void>> {
    const group = await this.groups.findById(id);
    if (
      !group ||
      group.tenantId !== tenantId ||
      group.projectId !== projectId
    ) {
      return Result.fail('Group not found');
    }
    await this.groups.delete(id);
    return Result.ok();
  }
}

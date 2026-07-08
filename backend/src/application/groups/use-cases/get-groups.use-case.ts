import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { GroupEntity } from '../domain/entities/group.entity';
import { IGroupRepository } from '../repositories/group.repository';

export interface GetGroupsRequest {
  tenantId: string;
  projectId: string;
}

@Injectable()
export class GetGroupsUseCase
  implements IUsecaseExecute<GetGroupsRequest, Result<GroupEntity[]>>
{
  constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  async execute({
    tenantId,
    projectId,
  }: GetGroupsRequest): Promise<Result<GroupEntity[]>> {
    const groups = await this.groups.findByProject(tenantId, projectId);
    return Result.ok(groups);
  }
}

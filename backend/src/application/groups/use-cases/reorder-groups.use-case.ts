import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { GroupEntity } from '../domain/entities/group.entity';
import { IGroupRepository } from '../repositories/group.repository';

export interface ReorderGroupsRequest {
  tenantId: string;
  projectId: string;
  ids: string[];
}

/** Re-assign each group's `order` to match the given id sequence. */
@Injectable()
export class ReorderGroupsUseCase
  implements IUsecaseExecute<ReorderGroupsRequest, Result<GroupEntity[]>>
{
  constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  async execute({
    tenantId,
    projectId,
    ids,
  }: ReorderGroupsRequest): Promise<Result<GroupEntity[]>> {
    const groups = await this.groups.findByProject(tenantId, projectId);
    const byId = new Map(groups.map((g) => [g.id.toString(), g]));

    // Only reorder ids that actually belong to this project; ignore strays.
    let order = 0;
    for (const id of ids) {
      const group = byId.get(id);
      if (!group) continue;
      group.setOrder(order);
      await this.groups.update(group);
      order += 1;
    }

    const updated = await this.groups.findByProject(tenantId, projectId);
    return Result.ok(updated);
  }
}

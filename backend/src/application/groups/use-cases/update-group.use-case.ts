import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UpdateGroupDto } from '../dtos/update-group.dto';
import { GroupEntity } from '../domain/entities/group.entity';
import { IGroupRepository } from '../repositories/group.repository';

export interface UpdateGroupRequest {
  id: string;
  tenantId: string;
  projectId: string;
  dto: UpdateGroupDto;
}

@Injectable()
export class UpdateGroupUseCase
  implements IUsecaseExecute<UpdateGroupRequest, Result<GroupEntity>>
{
  constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  async execute({
    id,
    tenantId,
    projectId,
    dto,
  }: UpdateGroupRequest): Promise<Result<GroupEntity>> {
    const group = await this.groups.findById(id);
    if (
      !group ||
      group.tenantId !== tenantId ||
      group.projectId !== projectId
    ) {
      return Result.fail('Group not found');
    }

    if (dto.title !== undefined) group.rename(dto.title);

    await this.groups.update(group);
    return Result.ok(group);
  }
}

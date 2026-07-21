import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { UpdateBugDto } from '../dtos/update-bug.dto';
import { BugEntity } from '../domain/entities/bug.entity';
import { IBugRepository } from '../repositories/bug.repository';

export interface UpdateBugRequest {
  id: string;
  tenantId: string;
  dto: UpdateBugDto;
}

@Injectable()
export class UpdateBugUseCase
  implements IUsecaseExecute<UpdateBugRequest, Result<BugEntity>>
{
  constructor(
    @Inject(IBugRepository) private readonly bugs: IBugRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({ id, tenantId, dto }: UpdateBugRequest): Promise<Result<BugEntity>> {
    const bug = await this.bugs.findById(id);
    if (!bug || bug.tenantId !== tenantId) return Result.fail('Bug not found');

    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId === '') {
        bug.assign('', '');
      } else {
        const assignee = await this.users.findById(dto.assigneeId);
        if (!assignee || assignee.tenantId !== tenantId) {
          return Result.fail('Assignee not found');
        }
        bug.assign(assignee.id.toString(), assignee.name);
      }
    }

    bug.applyUpdate({
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      type: dto.type,
      projectId: dto.projectId,
      caseId: dto.caseId,
      caseLabel: dto.caseLabel,
      reportId: dto.reportId,
      attachments: dto.attachments,
      labelKeys: dto.labelKeys,
      customFields: dto.customFields,
    });

    await this.bugs.update(bug);
    return Result.ok(bug);
  }
}

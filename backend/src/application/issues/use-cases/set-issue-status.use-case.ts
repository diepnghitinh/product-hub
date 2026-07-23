import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IssueEntity } from '../domain/entities/issue.entity';
import { IIssueRepository } from '../repositories/issue.repository';

export interface SetIssueStatusRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only movable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
  status: string;
}

/** Move an issue to another status column (Kanban drag). */
@Injectable()
export class SetIssueStatusUseCase
  implements IUsecaseExecute<SetIssueStatusRequest, Result<IssueEntity>>
{
  constructor(@Inject(IIssueRepository) private readonly issues: IIssueRepository) {}

  async execute({ id, tenantId, requesterId, isAdmin, status }: SetIssueStatusRequest): Promise<Result<IssueEntity>> {
    const issue = await this.issues.findById(id);
    if (!issue || issue.tenantId !== tenantId) return Result.fail('Issue not found');
    // A personal task can only be moved by its owner (or an admin).
    if (!issue.isVisibleTo(requesterId, isAdmin)) return Result.fail('Issue not found');
    issue.setStatus(status);
    await this.issues.update(issue);
    return Result.ok(issue);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IssueEntity } from '../domain/entities/issue.entity';
import { IIssueRepository } from '../repositories/issue.repository';

export interface GetIssueRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only readable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
}

@Injectable()
export class GetIssueUseCase implements IUsecaseExecute<GetIssueRequest, Result<IssueEntity>> {
  constructor(@Inject(IIssueRepository) private readonly issues: IIssueRepository) {}

  async execute({ id, tenantId, requesterId, isAdmin }: GetIssueRequest): Promise<Result<IssueEntity>> {
    // `id` is the URL ref: a shortId (TSK-7 / BUG-12) or a legacy uuid.
    const issue = await this.issues.findByRef(tenantId, id);
    if (!issue) return Result.fail('Issue not found');
    // A personal task is private to its owner (+ admins). Report "not found"
    // rather than "forbidden" so a stranger can't even confirm the ref exists.
    if (!issue.isVisibleTo(requesterId, isAdmin)) return Result.fail('Issue not found');
    return Result.ok(issue);
  }
}

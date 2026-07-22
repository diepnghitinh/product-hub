import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IssueKind } from '../domain/enums/issue.enums';
import { IIssueRepository } from '../repositories/issue.repository';

export interface DeleteIssueRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only deletable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
  /** Deleting a *bug* is restricted to admin/product (mirrors the old bug rule). */
  canDeleteBug: boolean;
}

@Injectable()
export class DeleteIssueUseCase implements IUsecaseExecute<DeleteIssueRequest, Result<void>> {
  constructor(@Inject(IIssueRepository) private readonly issues: IIssueRepository) {}

  async execute({ id, tenantId, requesterId, isAdmin, canDeleteBug }: DeleteIssueRequest): Promise<Result<void>> {
    const issue = await this.issues.findById(id);
    if (!issue || issue.tenantId !== tenantId) return Result.fail('Issue not found');
    // A bug may only be deleted by admin/product (the broader board write roles can
    // create and edit bugs, but not delete them).
    if (issue.kind === IssueKind.BUG && !canDeleteBug) return Result.fail('Issue not found');
    // A personal task can only be deleted by its owner (or an admin).
    if (!issue.isVisibleTo(requesterId, isAdmin)) return Result.fail('Issue not found');
    await this.issues.delete(id);
    return Result.ok();
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IssueEntity } from '../domain/entities/issue.entity';
import { ChildRollup, EMPTY_ROLLUP } from '../domain/issue-progress';
import { IIssueRepository } from '../repositories/issue.repository';

export interface GetIssueRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only readable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
}

/**
 * The issue plus the one thing it can't show without a second read: **its
 * parent**. Nesting is stored as a bare `parentId`, so every surface that wanted
 * to name the parent (the detail breadcrumb, `get_issue` over MCP) had only an
 * opaque id and showed nothing instead — a sub-issue read as top-level.
 */
export interface IssueWithParent {
  issue: IssueEntity;
  /** `null` when top-level, and equally when the parent is gone or the caller
   *  can't see it — a dangling `parentId` degrades to "no parent", never to a
   *  broken crumb. */
  parent: IssueEntity | null;
  /** This issue's own sub-task tally, so the detail page's percentage comes from
   *  the same rule the board's does. `{0,0}` for a leaf. */
  rollup: ChildRollup;
}

@Injectable()
export class GetIssueUseCase implements IUsecaseExecute<GetIssueRequest, Result<IssueWithParent>> {
  constructor(@Inject(IIssueRepository) private readonly issues: IIssueRepository) {}

  async execute({
    id,
    tenantId,
    requesterId,
    isAdmin,
  }: GetIssueRequest): Promise<Result<IssueWithParent>> {
    // `id` is the URL ref: a shortId (TSK-7 / BUG-12) or a legacy uuid.
    const issue = await this.issues.findByRef(tenantId, id);
    if (!issue) return Result.fail('Issue not found');
    // A personal task is private to its owner (+ admins). Report "not found"
    // rather than "forbidden" so a stranger can't even confirm the ref exists.
    if (!issue.isVisibleTo(requesterId, isAdmin)) return Result.fail('Issue not found');

    // The parent goes through the same tenant scope and the same visibility
    // rule, so a crumb can't leak the title of a private task the caller isn't
    // allowed to open.
    const parent = issue.parentId ? await this.issues.findByRef(tenantId, issue.parentId) : null;

    const issueId = issue.id.toString();
    const rollups = await this.issues.childRollups(tenantId, [issueId]);

    return Result.ok({
      issue,
      parent: parent?.isVisibleTo(requesterId, isAdmin) ? parent : null,
      rollup: rollups[issueId] ?? EMPTY_ROLLUP,
    });
  }
}

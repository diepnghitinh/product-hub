import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ITaskRepository } from '@application/tasks/repositories/task.repository';
import { IBugRepository } from '@application/bugs/repositories/bug.repository';
import { IIssueLinkRepository } from '../repositories/issue-link.repository';
import { INVERSE_RELATION, IssueKind } from '../domain/relation-type.enum';
import { IssueLinkResponseDto } from '../dtos/issue-link.response.dto';

export interface GetIssueLinksRequest {
  tenantId: string;
  issueType: IssueKind;
  issueId: string;
}

/**
 * Every relation touching an issue, resolved to the linked issue's shortId,
 * title and status (one request renders the whole list). Links are stored
 * source → target; a link found on the *target* side is returned with its
 * inverse relationType, so it reads correctly from whichever issue you asked.
 * A link whose other end was deleted is skipped.
 */
@Injectable()
export class GetIssueLinksUseCase
  implements IUsecaseExecute<GetIssueLinksRequest, Result<IssueLinkResponseDto[]>>
{
  constructor(
    @Inject(IIssueLinkRepository) private readonly links: IIssueLinkRepository,
    @Inject(ITaskRepository) private readonly tasks: ITaskRepository,
    @Inject(IBugRepository) private readonly bugs: IBugRepository,
  ) {}

  async execute(req: GetIssueLinksRequest): Promise<Result<IssueLinkResponseDto[]>> {
    const rows = await this.links.findForIssue(req.tenantId, req.issueType, req.issueId);
    const out: IssueLinkResponseDto[] = [];
    for (const row of rows) {
      const outgoing = row.sourceId === req.issueId;
      const otherId = outgoing ? row.targetId : row.sourceId;
      const relationType = outgoing ? row.relationType : INVERSE_RELATION[row.relationType];
      const issue = await this.resolve(req.issueType, otherId);
      if (!issue) continue; // the linked issue was deleted — drop the dangling row
      out.push({
        id: row.id,
        relationType,
        issueType: req.issueType,
        targetId: otherId,
        targetShortId: issue.shortId,
        targetTitle: issue.title,
        targetStatus: issue.status,
      });
    }
    return Result.ok(out);
  }

  private async resolve(
    kind: IssueKind,
    id: string,
  ): Promise<{ shortId: string; title: string; status: string } | null> {
    if (kind === IssueKind.Task) {
      const t = await this.tasks.findById(id);
      return t ? { shortId: t.shortId, title: t.title, status: t.status } : null;
    }
    const b = await this.bugs.findById(id);
    return b ? { shortId: b.shortId, title: b.title, status: b.status } : null;
  }
}

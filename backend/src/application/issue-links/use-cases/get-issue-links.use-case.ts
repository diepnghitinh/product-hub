import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
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
    // One repo for both kinds — tasks and bugs share the unified `issues` collection.
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}

  async execute(req: GetIssueLinksRequest): Promise<Result<IssueLinkResponseDto[]>> {
    const rows = await this.links.findForIssue(req.tenantId, req.issueType, req.issueId);
    const out: IssueLinkResponseDto[] = [];
    for (const row of rows) {
      const outgoing = row.sourceId === req.issueId;
      const otherId = outgoing ? row.targetId : row.sourceId;
      const relationType = outgoing ? row.relationType : INVERSE_RELATION[row.relationType];
      const issue = await this.resolve(otherId);
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
    id: string,
  ): Promise<{ shortId: string; title: string; status: string } | null> {
    const issue = await this.issues.findById(id);
    return issue ? { shortId: issue.shortId, title: issue.title, status: issue.status } : null;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IIssueLinkRepository } from '../repositories/issue-link.repository';
import { IssueKind, RelationType } from '../domain/relation-type.enum';

export interface CreateIssueLinkRequest {
  tenantId: string;
  createdBy: string;
  issueType: IssueKind;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
}

/**
 * Link two same-type issues. Rejects a self-link and validates both issues
 * belong to the caller's tenant; the repository's unique index makes a repeat
 * link idempotent.
 */
@Injectable()
export class CreateIssueLinkUseCase
  implements IUsecaseExecute<CreateIssueLinkRequest, Result<void>>
{
  constructor(
    @Inject(IIssueLinkRepository) private readonly links: IIssueLinkRepository,
    // One repo for both kinds — tasks and bugs share the unified `issues` collection.
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}

  async execute(req: CreateIssueLinkRequest): Promise<Result<void>> {
    if (req.sourceId === req.targetId) {
      return Result.fail('An issue cannot be linked to itself');
    }
    const [source, target] = await Promise.all([
      this.belongsToTenant(req.tenantId, req.sourceId),
      this.belongsToTenant(req.tenantId, req.targetId),
    ]);
    if (!source || !target) return Result.fail('Issue not found');

    await this.links.create({
      tenantId: req.tenantId,
      issueType: req.issueType,
      sourceId: req.sourceId,
      targetId: req.targetId,
      relationType: req.relationType,
      createdBy: req.createdBy,
    });
    return Result.ok();
  }

  private async belongsToTenant(tenantId: string, id: string): Promise<boolean> {
    const found = await this.issues.findById(id);
    return !!found && found.tenantId === tenantId;
  }
}

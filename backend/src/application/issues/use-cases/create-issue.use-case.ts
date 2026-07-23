import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { uniqueRef } from '@module-shared/utils/short-id.util';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { DEFAULT_TEAMS, TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { CreateIssueDto } from '../dtos/create-issue.dto';
import { IssueEntity } from '../domain/entities/issue.entity';
import { IssueKind } from '../domain/enums/issue.enums';
import { IIssueRepository } from '../repositories/issue.repository';

export interface CreateIssueRequest {
  tenantId: string;
  createdBy: string;
  createdByName: string;
  dto: CreateIssueDto;
}

@Injectable()
export class CreateIssueUseCase
  implements IUsecaseExecute<CreateIssueRequest, Result<IssueEntity>>
{
  constructor(
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
    @Inject(INotifier) private readonly notifier: INotifier,
  ) {}

  async execute({
    tenantId,
    createdBy,
    createdByName,
    dto,
  }: CreateIssueRequest): Promise<Result<IssueEntity>> {
    // A personal issue is always a private task (bugs are never personal).
    const kind = dto.personal ? IssueKind.TASK : dto.kind;
    const isBug = kind === IssueKind.BUG;

    let assigneeName = '';
    if (dto.assigneeId) {
      const assignee = await this.users.findById(dto.assigneeId);
      if (!assignee || assignee.tenantId !== tenantId) {
        return Result.fail('Assignee not found');
      }
      assigneeName = assignee.name;
    }

    // A personal task lives in no team; otherwise the issue lands in the tenant's
    // team for its kind (the passed team, or the workspace default — QC for bugs,
    // Engineering for tasks).
    const issueType = isBug ? TeamIssueType.BUG : TeamIssueType.TASK;
    const team = dto.personal
      ? null
      : await this.teams.findByKey(
          tenantId,
          DEFAULT_TEAMS.find((t) => t.issueType === issueType)!.key,
        );

    const created = IssueEntity.create({
      kind,
      tenantId,
      teamId: dto.personal ? '' : dto.teamId || team?.id.toString() || '',
      ownerId: dto.personal ? createdBy : '',
      parentId: dto.parentId,
      shortId: await uniqueRef(isBug ? 'BUG' : 'TSK', (ref) =>
        this.issues.findByRef(tenantId, ref).then((i) => i !== null),
      ),
      title: dto.title,
      description: dto.description,
      status: dto.status,
      roadmapId: dto.roadmapId,
      roadmapItemId: dto.roadmapItemId,
      roadmapItemLabel: dto.roadmapItemLabel,
      projectId: dto.projectId,
      assigneeId: dto.assigneeId,
      assigneeName,
      createdBy,
      createdByName,
      // A bug's reporter is its creator; a task has no reporter.
      reporterId: isBug ? createdBy : '',
      reporterName: isBug ? createdByName : '',
      startDate: dto.startDate,
      endDate: dto.endDate,
      dueDate: dto.dueDate,
      estimate: dto.estimate,
      severity: dto.severity,
      type: dto.type,
      caseId: dto.caseId,
      caseLabel: dto.caseLabel,
      reportId: dto.reportId,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const issue = created.getValue();
    await this.issues.save(issue);

    // Preserve the bug's outbound webhooks (best-effort, never blocks the response).
    if (isBug) {
      const severityLabel: Record<string, string> = {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        critical: 'Critical',
      };
      await this.notifier.notify(
        tenantId,
        WebhookEvent.BUG_CREATED,
        [
          `🐛 New bug reported: ${issue.title}`,
          `Severity: ${severityLabel[issue.severity] ?? issue.severity}`,
          `Type: ${issue.type}`,
          `Status: ${issue.status}`,
          `Reporter: ${createdByName}`,
          assigneeName ? `Assigned to: ${assigneeName}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        { link: `/bugs/${issue.shortId}` },
      );
      if (assigneeName) {
        await this.notifier.notify(
          tenantId,
          WebhookEvent.BUG_ASSIGNED,
          [`📌 Bug assigned: ${issue.title}`, `Status: ${issue.status}`].join('\n'),
          { mentionUserIds: dto.assigneeId ? [dto.assigneeId] : [], link: `/bugs/${issue.shortId}` },
        );
      }
    }

    return Result.ok(issue);
  }
}

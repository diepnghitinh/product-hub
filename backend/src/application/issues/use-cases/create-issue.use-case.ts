import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { uniqueRef } from '@module-shared/utils/short-id.util';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { DEFAULT_TEAMS, TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { ICycleRepository } from '@application/cycles/repositories/cycle.repository';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { todayISO } from '@application/cycles/domain/cycle-dates';
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
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
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

    const teamId = dto.personal ? '' : dto.teamId || team?.id.toString() || '';

    // Born into a cycle. Two ways in:
    //  1. An explicit cycleId (a board filtered to one creates into it) — validated
    //     like the update path: the issue's own team's cycle, still open, never on a
    //     personal task. Otherwise the card would "save" and instantly vanish from the
    //     filtered board (the teamId pitfall all over again).
    //  2. Auto-add: no cycle named, but the landing team runs cycles → join its
    //     ACTIVE cycle, so new work shows under "Current" instead of an invisible
    //     no-cycle backlog (Scrum — new work enters the sprint). No active cycle
    //     (cooldown, or cycles off) ⇒ it stays cycle-less.
    let cycleId = dto.cycleId;
    if (cycleId) {
      if (dto.personal) return Result.fail('Personal tasks cannot join a cycle');
      const cycle = await this.cycles.findById(tenantId, cycleId);
      if (!cycle || cycle.teamId !== teamId) return Result.fail('Cycle not found');
      if (cycle.statusOn(todayISO()) === CycleStatus.COMPLETED) {
        return Result.fail('Completed cycles cannot take new issues');
      }
    } else if (!dto.personal && teamId) {
      // `team` is the kind's default team; the issue may land in a different one
      // (dto.teamId), so read the landing team's own rhythm.
      const landingTeam =
        team && team.id.toString() === teamId ? team : await this.teams.findById(tenantId, teamId);
      if (landingTeam?.cyclesEnabled) {
        const active = (await this.cycles.findByTeam(tenantId, teamId)).find(
          (c) => c.statusOn(todayISO()) === CycleStatus.ACTIVE,
        );
        if (active) cycleId = active.id.toString();
      }
    }

    const created = IssueEntity.create({
      kind,
      tenantId,
      teamId,
      cycleId,
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

import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { CounterService } from '@module-shared/services/counter.service';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { DEFAULT_TEAMS, TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { CreateBugDto } from '../dtos/create-bug.dto';
import { BugEntity } from '../domain/entities/bug.entity';
import { IBugRepository } from '../repositories/bug.repository';

export interface CreateBugRequest {
  tenantId: string;
  reporterId: string;
  reporterName: string;
  dto: CreateBugDto;
}

@Injectable()
export class CreateBugUseCase
  implements IUsecaseExecute<CreateBugRequest, Result<BugEntity>>
{
  constructor(
    @Inject(IBugRepository) private readonly bugs: IBugRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(INotifier) private readonly notifier: INotifier,
    private readonly counter: CounterService,
    @Inject(ITeamRepository) private readonly teams: ITeamRepository,
  ) {}

  async execute({
    tenantId,
    reporterId,
    reporterName,
    dto,
  }: CreateBugRequest): Promise<Result<BugEntity>> {
    let assigneeName = '';
    if (dto.assigneeId) {
      const assignee = await this.users.findById(dto.assigneeId);
      if (!assignee || assignee.tenantId !== tenantId) {
        return Result.fail('Assignee not found');
      }
      assigneeName = assignee.name;
    }

    // Bugs live in the tenant's bug team (QC by default).
    const team = await this.teams.findByKey(
      tenantId,
      DEFAULT_TEAMS.find((t) => t.issueType === TeamIssueType.BUG)!.key,
    );

    const created = BugEntity.create({
      tenantId,
      teamId: dto.teamId || team?.id.toString() || '',
      shortId: await this.counter.nextShortId(tenantId, 'BUG'),
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      // Lets a board open a bug straight into the column it was added from.
      status: dto.status,
      type: dto.type,
      projectId: dto.projectId,
      caseId: dto.caseId,
      caseLabel: dto.caseLabel,
      reportId: dto.reportId,
      assigneeId: dto.assigneeId,
      assigneeName,
      reporterId,
      reporterName,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const bug = created.getValue();
    await this.bugs.save(bug);

    // Best-effort outbound notifications (never block the response).
    await this.notifier.notify(
      tenantId,
      WebhookEvent.BUG_CREATED,
      `🐞 New bug [${bug.severity}]: ${bug.title} — reported by ${reporterName}`,
    );
    if (assigneeName) {
      await this.notifier.notify(
        tenantId,
        WebhookEvent.BUG_ASSIGNED,
        `📌 Bug assigned to ${assigneeName}: ${bug.title}`,
        { mentionUserIds: dto.assigneeId ? [dto.assigneeId] : [] },
      );
    }

    return Result.ok(bug);
  }
}

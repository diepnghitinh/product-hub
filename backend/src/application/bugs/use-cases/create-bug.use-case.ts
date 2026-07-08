import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
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

    const created = BugEntity.create({
      tenantId,
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      type: dto.type,
      projectId: dto.projectId,
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
      );
    }

    return Result.ok(bug);
  }
}

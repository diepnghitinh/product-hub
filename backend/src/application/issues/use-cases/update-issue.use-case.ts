import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { ICycleRepository } from '@application/cycles/repositories/cycle.repository';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { todayISO } from '@application/cycles/domain/cycle-dates';
import { UpdateIssueDto } from '../dtos/update-issue.dto';
import { IssueEntity } from '../domain/entities/issue.entity';
import { IIssueRepository } from '../repositories/issue.repository';
import { resolveIssueAssignees } from './resolve-assignees';

export interface UpdateIssueRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only editable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
  dto: UpdateIssueDto;
}

@Injectable()
export class UpdateIssueUseCase
  implements IUsecaseExecute<UpdateIssueRequest, Result<IssueEntity>>
{
  constructor(
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
  ) {}

  async execute({ id, tenantId, requesterId, isAdmin, dto }: UpdateIssueRequest): Promise<Result<IssueEntity>> {
    const issue = await this.issues.findById(id);
    if (!issue || issue.tenantId !== tenantId) return Result.fail('Issue not found');
    // A personal task can only be edited by its owner (or an admin).
    if (!issue.isVisibleTo(requesterId, isAdmin)) return Result.fail('Issue not found');

    // Either shape replaces the whole list: `assigneeIds` is the list itself,
    // `assigneeId` the one-person shorthand ('' unassigns) that the bulk bar, MCP
    // and older clients still send.
    const wanted =
      dto.assigneeIds ??
      (dto.assigneeId !== undefined ? (dto.assigneeId ? [dto.assigneeId] : []) : undefined);
    if (wanted !== undefined) {
      const resolved = await resolveIssueAssignees(this.users, tenantId, wanted);
      if (resolved.isFailure) return Result.fail(resolved.error as string);
      issue.setAssignees(resolved.getValue());
    }

    if (dto.cycleId !== undefined && dto.cycleId !== issue.cycleId) {
      if (dto.cycleId === '') {
        issue.setCycle('');
      } else {
        // Cycles are team-scoped and history is immutable: only the issue's own
        // team's current/upcoming cycles are joinable. Personal tasks have no
        // team, so they never join one.
        if (issue.isPersonal) return Result.fail('Personal tasks cannot join a cycle');
        const cycle = await this.cycles.findById(tenantId, dto.cycleId);
        if (!cycle || cycle.teamId !== issue.teamId) return Result.fail('Cycle not found');
        if (cycle.statusOn(todayISO()) === CycleStatus.COMPLETED) {
          return Result.fail('Completed cycles cannot take new issues');
        }
        issue.setCycle(dto.cycleId);
      }
    }

    issue.applyUpdate({
      title: dto.title,
      description: dto.description,
      projectId: dto.projectId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      dueDate: dto.dueDate,
      labelKeys: dto.labelKeys,
      customFields: dto.customFields,
      // task-only
      parentId: dto.parentId,
      roadmapId: dto.roadmapId,
      roadmapItemId: dto.roadmapItemId,
      roadmapItemLabel: dto.roadmapItemLabel,
      estimate: dto.estimate,
      // bug-only
      severity: dto.severity,
      type: dto.type,
      caseId: dto.caseId,
      caseLabel: dto.caseLabel,
      reportId: dto.reportId,
      attachments: dto.attachments,
    });

    await this.issues.update(issue);
    return Result.ok(issue);
  }
}

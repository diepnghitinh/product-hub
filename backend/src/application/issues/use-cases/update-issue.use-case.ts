import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { ConflictException } from '@core/exceptions';
import { Result } from '@shared/logic/result';
import { issueRefsInText } from '@module-shared/utils/short-id.util';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { ICycleRepository } from '@application/cycles/repositories/cycle.repository';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { todayISO } from '@application/cycles/domain/cycle-dates';
import { UpdateIssueDto } from '../dtos/update-issue.dto';
import { normalizeBranchName } from '../domain/branch-name';
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
export class UpdateIssueUseCase implements IUsecaseExecute<
  UpdateIssueRequest,
  Result<IssueEntity>
> {
  constructor(
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(ICycleRepository) private readonly cycles: ICycleRepository,
  ) {}

  async execute({
    id,
    tenantId,
    requesterId,
    isAdmin,
    dto,
  }: UpdateIssueRequest): Promise<Result<IssueEntity>> {
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

    // A chosen branch name has to be free before it's ours: one branch names one
    // issue, or the CI label that reads the branch has two issues to point at.
    if (dto.branchName !== undefined) {
      const wantedBranch = normalizeBranchName(dto.branchName);
      if (wantedBranch && wantedBranch !== issue.branch) {
        // Refs are how everything downstream (the pipeline webhook, a reader
        // skimming a branch list) decides which issue a branch belongs to, so a
        // name carrying someone *else's* ref is taken even though no row holds it
        // — that's the derived name of an issue that never had to store one.
        const ownRef = (issue.shortId || '').toUpperCase();
        const otherRef = issueRefsInText(wantedBranch).find((ref) => ref !== ownRef);
        if (otherRef) {
          throw new ConflictException(`That branch name refers to another issue (${otherRef})`);
        }
        const taken = await this.issues.findByBranchName(tenantId, wantedBranch);
        if (taken && taken.id.toString() !== issue.id.toString()) {
          throw new ConflictException(
            `${taken.shortId || 'Another issue'} already uses that branch name`,
          );
        }
      }
      issue.setBranchName(dto.branchName);
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

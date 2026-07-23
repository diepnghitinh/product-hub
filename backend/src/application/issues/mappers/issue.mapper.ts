import { IssueEntity } from '../domain/entities/issue.entity';
import { IssueResponseDto } from '../dtos/issue.response.dto';

export class IssueMapper {
  static toResponseDto(issue: IssueEntity): IssueResponseDto {
    return {
      kind: issue.kind,
      id: issue.id.toString(),
      tenantId: issue.tenantId,
      teamId: issue.teamId,
      ownerId: issue.ownerId,
      parentId: issue.parentId,
      shortId: issue.shortId,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      roadmapId: issue.roadmapId,
      roadmapItemId: issue.roadmapItemId,
      roadmapItemLabel: issue.roadmapItemLabel,
      projectId: issue.projectId,
      cycleId: issue.cycleId,
      carryOverCount: issue.carryOverCount,
      assigneeId: issue.assigneeId,
      assigneeName: issue.assigneeName,
      createdBy: issue.createdBy,
      createdByName: issue.createdByName,
      reporterId: issue.reporterId,
      reporterName: issue.reporterName,
      startDate: issue.startDate,
      endDate: issue.endDate,
      dueDate: issue.dueDate,
      estimate: issue.estimate,
      severity: issue.severity,
      type: issue.type,
      caseId: issue.caseId,
      caseLabel: issue.caseLabel,
      reportId: issue.reportId,
      attachments: issue.attachments,
      labelKeys: issue.labelKeys,
      customFields: issue.customFields,
      order: issue.order,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }

  static toResponseDtoArray(issues: IssueEntity[]): IssueResponseDto[] {
    return issues.map((i) => this.toResponseDto(i));
  }
}

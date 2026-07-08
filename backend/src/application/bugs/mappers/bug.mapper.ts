import { BugEntity } from '../domain/entities/bug.entity';
import { BugResponseDto } from '../dtos/bug.response.dto';

export class BugMapper {
  static toResponseDto(bug: BugEntity): BugResponseDto {
    return {
      id: bug.id.toString(),
      tenantId: bug.tenantId,
      title: bug.title,
      description: bug.description,
      severity: bug.severity,
      status: bug.status,
      type: bug.type,
      projectId: bug.projectId,
      assigneeId: bug.assigneeId,
      assigneeName: bug.assigneeName,
      reporterId: bug.reporterId,
      reporterName: bug.reporterName,
      order: bug.order,
      createdAt: bug.createdAt,
      updatedAt: bug.updatedAt,
    };
  }

  static toResponseDtoArray(bugs: BugEntity[]): BugResponseDto[] {
    return bugs.map((b) => this.toResponseDto(b));
  }
}

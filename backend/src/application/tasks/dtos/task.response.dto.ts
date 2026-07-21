import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '../domain/enums/task.enums';

/** Flat task shape — assignee/author names are denormalized so a task list reads
 * without needing the (admin-only) user list. The backlog-item link mirrors the
 * bug→case link (id + human label + parent id). */
export class TaskResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ description: 'The team whose issue list this is in' })
  teamId: string;

  @ApiProperty({ description: 'Human-friendly reference used in URLs', example: 'BUG-12' })
  shortId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: TaskStatus })
  status: string;

  @ApiProperty()
  roadmapId: string;

  @ApiProperty()
  roadmapItemId: string;

  @ApiProperty()
  roadmapItemLabel: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  assigneeId: string;

  @ApiProperty()
  assigneeName: string;

  @ApiProperty()
  createdBy: string;

  @ApiProperty()
  createdByName: string;

  @ApiProperty()
  dueDate: string;

  @ApiProperty({ description: 'Size estimate in points (0 = no estimate)' })
  estimate: number;

  @ApiProperty({ type: [String], description: "Keys of the team labels on this task" })
  labelKeys: string[];

  @ApiProperty()
  order: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

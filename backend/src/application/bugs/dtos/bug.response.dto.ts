import { ApiProperty } from '@nestjs/swagger';
import { BugSeverity, BugStatus } from '../domain/enums/bug.enums';

/** Flat bug shape — assignee/reporter names are denormalized so the board reads
 * without needing the (admin-only) user list. */
export class BugResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: BugSeverity })
  severity: BugSeverity;

  @ApiProperty({ enum: BugStatus })
  status: BugStatus;

  @ApiProperty()
  type: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  assigneeId: string;

  @ApiProperty()
  assigneeName: string;

  @ApiProperty()
  reporterId: string;

  @ApiProperty()
  reporterName: string;

  @ApiProperty()
  order: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

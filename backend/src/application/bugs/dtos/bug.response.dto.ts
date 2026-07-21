import { ApiProperty } from '@nestjs/swagger';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { BugAttachment, BugSeverity, BugStatus } from '../domain/enums/bug.enums';

/** Flat bug shape — assignee/reporter names are denormalized so the board reads
 * without needing the (admin-only) user list. */
export class BugResponseDto {
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

  @ApiProperty({ enum: BugSeverity })
  severity: BugSeverity;

  @ApiProperty({ enum: BugStatus })
  status: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  caseId: string;

  @ApiProperty()
  caseLabel: string;

  @ApiProperty()
  reportId: string;

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

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  attachments: BugAttachment[];

  @ApiProperty({ type: [String], description: "Keys of the team labels on this bug" })
  labelKeys: string[];

  @ApiProperty({
    type: Object,
    description: 'Values for the team custom fields, keyed by each field id',
  })
  customFields: Record<string, CustomFieldValue>;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

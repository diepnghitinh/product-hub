import { ApiProperty } from '@nestjs/swagger';
import { CustomFieldValue } from '@application/teams/domain/enums/custom-field.enums';
import { BugAttachment, BugSeverity, IssueKind } from '../domain/enums/issue.enums';

/**
 * Flat issue shape — the union of the old Task and Bug responses with a `kind`.
 * Assignee/author/reporter names are denormalized so a list reads without needing
 * the (admin-only) user list. Kind-specific fields carry a neutral value on the
 * other kind (a task's `severity` is `''`, a bug's `estimate` is `0`).
 */
export class IssueResponseDto {
  @ApiProperty({ enum: IssueKind })
  kind: IssueKind;

  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ description: 'The team whose issue list this is in' })
  teamId: string;

  @ApiProperty({ description: "Owner of a private personal task ('' for a team issue / bug)" })
  ownerId: string;

  @ApiProperty({ description: 'Parent issue id when this is a sub-task ("" if top-level)' })
  parentId: string;

  @ApiProperty({ description: 'Human-friendly reference used in URLs', example: 'TSK-7' })
  shortId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ description: 'Status column key (built-in or custom slug)' })
  status: string;

  @ApiProperty()
  roadmapId: string;

  @ApiProperty()
  roadmapItemId: string;

  @ApiProperty()
  roadmapItemLabel: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty({ description: "The team cycle this issue is committed to ('' = none)" })
  cycleId: string;

  @ApiProperty({
    description: 'Times auto-rollover carried this issue into the next cycle (0 = none)',
  })
  carryOverCount: number;

  @ApiProperty()
  assigneeId: string;

  @ApiProperty()
  assigneeName: string;

  @ApiProperty()
  createdBy: string;

  @ApiProperty()
  createdByName: string;

  @ApiProperty({ description: 'Bug reporter ("" for a task)' })
  reporterId: string;

  @ApiProperty()
  reporterName: string;

  @ApiProperty({ description: 'Start date as YYYY-MM-DD ("" when unset)' })
  startDate: string;

  @ApiProperty({ description: 'End / target date as YYYY-MM-DD ("" when unset)' })
  endDate: string;

  @ApiProperty({ deprecated: true, description: 'Legacy alias of endDate (task); kept in sync' })
  dueDate: string;

  @ApiProperty({ description: 'Size estimate in points (task; 0 = no estimate)' })
  estimate: number;

  @ApiProperty({ enum: BugSeverity, description: 'Bug severity ("" for a task)' })
  severity: BugSeverity | '';

  @ApiProperty({ description: 'Bug type/category' })
  type: string;

  @ApiProperty()
  caseId: string;

  @ApiProperty()
  caseLabel: string;

  @ApiProperty()
  reportId: string;

  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'Bug attachments' })
  attachments: BugAttachment[];

  @ApiProperty({ type: [String], description: 'Keys of the team labels on this issue' })
  labelKeys: string[];

  @ApiProperty({
    type: Object,
    description: 'Values for the team custom fields, keyed by each field id',
  })
  customFields: Record<string, CustomFieldValue>;

  @ApiProperty()
  order: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

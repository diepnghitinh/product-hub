import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';

/** A saved view as returned to the client (flat). */
export class SavedViewResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  icon: string;

  @ApiPropertyOptional({ nullable: true })
  color: string | null;

  @ApiProperty()
  scope: string;

  @ApiProperty()
  shared: boolean;

  @ApiProperty({ enum: IssueKind })
  kind: IssueKind;

  @ApiProperty({ enum: ['board', 'list', 'timeline', 'calendar'] })
  view: 'board' | 'list' | 'timeline' | 'calendar';

  @ApiProperty({ type: Object })
  filters: Record<string, string[]>;

  @ApiPropertyOptional({ nullable: true })
  sort: { field: string; dir: 'asc' | 'desc' } | null;

  @ApiProperty()
  search: string;

  @ApiProperty()
  order: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

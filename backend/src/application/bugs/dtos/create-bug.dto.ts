import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { BugSeverity } from '../domain/enums/bug.enums';

export class CreateBugDto {
  @ApiProperty({ example: 'Checkout button unresponsive on Safari' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: BugSeverity, default: BugSeverity.MEDIUM })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  /**
   * Which column to open in. A plain string, not `@IsEnum(BugStatus)`: a team's
   * columns can be custom slugs, the same way `UpdateBugStatusDto` treats it.
   * Omit and the bug opens in the first column.
   */
  @ApiPropertyOptional({ description: "Built-in BugStatus or a team's custom column key" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'UI' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Link to a project' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Link to the test case this bug came from' })
  @IsOptional()
  @IsString()
  caseId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label of the linked case' })
  @IsOptional()
  @IsString()
  caseLabel?: string;

  @ApiPropertyOptional({ description: 'Link to the report/feature the case belongs to' })
  @IsOptional()
  @IsString()
  reportId?: string;

  @ApiPropertyOptional({ description: 'Assignee user id' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Start date as YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End / target date as YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Team whose issue list to create in (defaults to the workspace's team for this type)" })
  @IsOptional()
  @IsString()
  teamId?: string;
}

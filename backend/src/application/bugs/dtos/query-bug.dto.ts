import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { TransformQueryArray } from '@module-shared/utils/query-array.util';
import { BugSeverity, BugStatus } from '../domain/enums/bug.enums';

/** Multi-value filters accept `?x=a`, `?x=a,b` or `?x=a&x=b` — see
 * `TransformQueryArray`, which keeps the older single-value callers working. */
export class QueryBugDto extends PaginationDto {
  @ApiPropertyOptional({ enum: BugStatus, isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsEnum(BugStatus, { each: true })
  status?: BugStatus[];

  @ApiPropertyOptional({ enum: BugSeverity, isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsEnum(BugSeverity, { each: true })
  severity?: BugSeverity[];

  @ApiPropertyOptional({ description: 'Filter by assignee user id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  assigneeId?: string[];

  @ApiPropertyOptional({ description: 'Filter by project id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  projectId?: string[];

  @ApiPropertyOptional({ description: 'Filter by linked test case id' })
  @IsOptional()
  @IsString()
  caseId?: string;

  @ApiPropertyOptional({ description: 'Filter by linked report id' })
  @IsOptional()
  @IsString()
  reportId?: string;
}

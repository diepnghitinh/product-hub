import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { TransformQueryArray } from '@module-shared/utils/query-array.util';
import { TaskStatus } from '../domain/enums/task.enums';

/** Multi-value filters accept `?x=a`, `?x=a,b` or `?x=a&x=b` — see
 * `TransformQueryArray`, which keeps the older single-value callers working. */
export class QueryTaskDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TaskStatus, isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsEnum(TaskStatus, { each: true })
  status?: TaskStatus[];

  @ApiPropertyOptional({ description: 'Filter by assignee user id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  assigneeId?: string[];

  @ApiPropertyOptional({ description: "Filter by the team's issue list" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Tasks assigned to OR created by this user id' })
  @IsOptional()
  @IsString()
  mine?: string;

  @ApiPropertyOptional({ description: 'Filter by parent task id(s) — a task’s sub-tasks', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  parentId?: string[];

  @ApiPropertyOptional({
    description: 'Filter by linked backlog item (roadmap item) id(s)',
    isArray: true,
  })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  roadmapItemId?: string[];

  @ApiPropertyOptional({ description: 'Filter by linked roadmap id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  roadmapId?: string[];

  @ApiPropertyOptional({ description: 'Filter by project id(s)', isArray: true })
  @IsOptional()
  @TransformQueryArray()
  @IsArray()
  @IsString({ each: true })
  projectId?: string[];
}

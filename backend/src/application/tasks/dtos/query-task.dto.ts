import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { TaskStatus } from '../domain/enums/task.enums';

export class QueryTaskDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Filter by assignee user id' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Tasks assigned to OR created by this user id' })
  @IsOptional()
  @IsString()
  mine?: string;

  @ApiPropertyOptional({ description: 'Filter by linked backlog item (roadmap item) id' })
  @IsOptional()
  @IsString()
  roadmapItemId?: string;

  @ApiPropertyOptional({ description: 'Filter by linked roadmap id' })
  @IsOptional()
  @IsString()
  roadmapId?: string;

  @ApiPropertyOptional({ description: 'Filter by project id' })
  @IsOptional()
  @IsString()
  projectId?: string;
}

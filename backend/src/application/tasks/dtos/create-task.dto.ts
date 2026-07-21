import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TASK_ESTIMATE_VALUES, TaskStatus } from '../domain/enums/task.enums';

export class CreateTaskDto {
  @ApiProperty({ example: 'Wire the passkey ceremony to the auth endpoint' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TODO })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Linked roadmap (backlog) id' })
  @IsOptional()
  @IsString()
  roadmapId?: string;

  @ApiPropertyOptional({ description: 'The linked backlog item (roadmap item) id' })
  @IsOptional()
  @IsString()
  roadmapItemId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label of the linked backlog item' })
  @IsOptional()
  @IsString()
  roadmapItemLabel?: string;

  @ApiPropertyOptional({ description: 'Link to a project' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Assignee user id' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Due date as YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Size estimate in points (0 = no estimate)',
    enum: TASK_ESTIMATE_VALUES,
  })
  @IsOptional()
  @IsIn(TASK_ESTIMATE_VALUES)
  estimate?: number;

  @ApiPropertyOptional({ description: "Team whose issue list to create in (defaults to the workspace's team for this type)" })
  @IsOptional()
  @IsString()
  teamId?: string;
}

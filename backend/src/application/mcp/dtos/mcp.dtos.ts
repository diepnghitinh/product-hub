import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BugSeverity, IssueKind } from '@application/issues/domain/enums/issue.enums';
import {
  RoadmapDifficulty,
  RoadmapItemStatus,
} from '@application/roadmaps/domain/enums/roadmap.enums';

/**
 * MCP request shapes. Every reference to another record accepts *either* an id
 * or the human name — an assistant reads "file it under QC" long before it reads
 * a uuid, and forcing it to look one up first turns one tool call into three.
 * Resolution lives server-side so any future transport inherits it.
 */
export class McpCreateIssueDto {
  @ApiProperty({ enum: IssueKind, description: 'task or bug' })
  @IsEnum(IssueKind)
  kind: IssueKind;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Plain text or HTML' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Team id or name. Defaults to the workspace's team for the kind" })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({ description: "Status key or column label. Defaults to the team's first column" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Assignee user id, name or email' })
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({ enum: BugSeverity, description: 'Bugs only' })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ description: 'Story points — tasks only' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimate?: number;

  @ApiPropertyOptional({ description: 'ISO date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Backlog (roadmap) item id to file this under — its roadmap is resolved for you',
  })
  @IsOptional()
  @IsString()
  backlogItemId?: string;
}

export class McpCreateBacklogItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Roadmap id or title. Defaults to the only roadmap when there is one' })
  @IsOptional()
  @IsString()
  roadmap?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Column key or label — Now / Next / Later, or a custom one' })
  @IsOptional()
  @IsString()
  phase?: string;

  @ApiPropertyOptional({ enum: RoadmapItemStatus })
  @IsOptional()
  @IsEnum(RoadmapItemStatus)
  status?: RoadmapItemStatus;

  @ApiPropertyOptional({ enum: RoadmapDifficulty })
  @IsOptional()
  @IsEnum(RoadmapDifficulty)
  difficulty?: RoadmapDifficulty;

  // The board scores RICE on 1–5 for every input (not the classic mixed scales),
  // so the same bounds the item page enforces apply here. Default 3 across the
  // board — a score of 9, exactly what the app's own "+ Add" creates.
  @ApiPropertyOptional({ description: 'RICE reach, 1–5', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  reach?: number;

  @ApiPropertyOptional({ description: 'RICE impact, 1–5', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  impact?: number;

  @ApiPropertyOptional({ description: 'RICE confidence, 1–5', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  confidence?: number;

  @ApiPropertyOptional({ description: 'RICE effort, 1–5', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  effort?: number;

  @ApiPropertyOptional({ description: 'ISO date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;
}

/** Lookup before creating, so an assistant can spot a duplicate itself. */
export class McpSearchIssuesDto {
  @ApiPropertyOptional({ description: 'Free-text match on title / reference' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: IssueKind })
  @IsOptional()
  @IsEnum(IssueKind)
  kind?: IssueKind;

  @ApiPropertyOptional({ description: 'Team id or name' })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

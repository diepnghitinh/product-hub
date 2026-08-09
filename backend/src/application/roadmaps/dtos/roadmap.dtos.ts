import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  RoadmapColumn,
  RoadmapColumnTemplate,
  RoadmapEpic,
  RoadmapItemData,
} from '../domain/types/roadmap-item.type';

export class CreateRoadmapDto {
  @ApiProperty({ example: 'Q3 Roadmap' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;
}

export class UpdateRoadmapDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;
}

export class ReplaceRoadmapItemsDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  items: RoadmapItemData[];
}

/**
 * How this roadmap's columns are decided — the two footings, one endpoint.
 *
 * Send `templateId` to point the board at a workspace template (its `columns`
 * are then read live and anything sent here is ignored). Send `columns` to run
 * a set of its own, which also unlinks it from whatever template it was on.
 */
export class ReplaceRoadmapColumnsDto {
  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  columns?: RoadmapColumn[];

  @ApiPropertyOptional({
    nullable: true,
    description: 'Link to a workspace template; null/empty means custom columns',
  })
  @IsOptional()
  @IsString()
  templateId?: string | null;
}

/** Replace the workspace's roadmap column templates, in order. */
export class ReplaceRoadmapTemplatesDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  templates: RoadmapColumnTemplate[];
}

export class ReplaceRoadmapEpicsDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  epics: RoadmapEpic[];
}

export class ShareRoadmapDto {
  @ApiProperty({ description: 'Enable or disable the public read-only link' })
  @IsBoolean()
  enabled: boolean;
}

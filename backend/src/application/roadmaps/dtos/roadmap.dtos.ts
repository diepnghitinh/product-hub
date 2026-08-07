import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RoadmapColumn, RoadmapEpic, RoadmapItemData } from '../domain/types/roadmap-item.type';

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

export class ReplaceRoadmapColumnsDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  columns: RoadmapColumn[];
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

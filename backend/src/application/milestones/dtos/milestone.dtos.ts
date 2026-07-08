import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MilestoneStatus, ObjectiveData } from '../domain/milestone.types';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'H2 Objectives' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ example: 'Jul–Dec 2026' })
  @IsOptional()
  @IsString()
  timeframe?: string;
}

export class UpdateMilestoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timeframe?: string;

  @ApiPropertyOptional({ enum: MilestoneStatus })
  @IsOptional()
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roadmapIds?: string[];
}

export class ReplaceObjectivesDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  objectives: ObjectiveData[];
}

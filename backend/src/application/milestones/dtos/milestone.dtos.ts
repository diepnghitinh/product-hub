import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MilestoneStatus } from '../domain/milestone.types';

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

export class KeyResultInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional({ description: 'Achievement, 0–100.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  owner?: string;

  @ApiPropertyOptional({
    description: 'Share (%) of the objective. Re-split server-side to sum to 100.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({ description: 'Held steady while siblings rebalance.' })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class ObjectiveInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiProperty({ type: [KeyResultInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeyResultInputDto)
  keyResults: KeyResultInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReplaceObjectivesDto {
  @ApiProperty({ type: [ObjectiveInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObjectiveInputDto)
  objectives: ObjectiveInputDto[];
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FeatureStatus } from '../domain/enums/feature-status.enum';

export class UpdateReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  featureId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  owner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reported?: string;

  @ApiPropertyOptional({ description: 'Move to another group (id)' })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ enum: FeatureStatus })
  @IsOptional()
  @IsEnum(FeatureStatus)
  statusVariant?: FeatureStatus;
}

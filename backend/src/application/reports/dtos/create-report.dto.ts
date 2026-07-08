import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FeatureStatus } from '../domain/enums/feature-status.enum';

export class CreateReportDto {
  @ApiProperty({ example: 'Login with email' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Group id to file under' })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ example: 'Login' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ enum: FeatureStatus, default: FeatureStatus.TESTING })
  @IsOptional()
  @IsEnum(FeatureStatus)
  statusVariant?: FeatureStatus;
}

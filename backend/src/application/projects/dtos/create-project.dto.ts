import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Environment } from '../domain/enums/environment.enum';

export class CreateProjectDto {
  @ApiProperty({ example: 'Checkout Revamp' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ example: 'Q3 payments initiative' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  subtitle?: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  owner?: string;

  @ApiPropertyOptional({ enum: Environment, default: Environment.DEVELOPMENT })
  @IsOptional()
  @IsEnum(Environment)
  environment?: Environment;
}

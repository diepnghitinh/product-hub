import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Environment } from '../domain/enums/environment.enum';

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Checkout Revamp' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

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

  @ApiPropertyOptional({ enum: Environment })
  @IsOptional()
  @IsEnum(Environment)
  environment?: Environment;

  @ApiPropertyOptional({ description: 'Pin the project to the top of the Dashboard' })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

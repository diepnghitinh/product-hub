import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { Environment } from '../domain/enums/environment.enum';

export class QueryProjectDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Environment })
  @IsOptional()
  @IsEnum(Environment)
  environment?: Environment;

  @ApiPropertyOptional({
    description: 'When true, list archived (soft-deleted) projects instead of active ones',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived?: boolean = false;
}

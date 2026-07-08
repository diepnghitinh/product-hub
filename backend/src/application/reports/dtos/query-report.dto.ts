import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryReportDto {
  @ApiPropertyOptional({ description: 'Filter to a single group id' })
  @IsOptional()
  @IsString()
  groupId?: string;
}

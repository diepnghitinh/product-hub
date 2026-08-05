import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BUG_STAT_DIMENSIONS, BugStatDimension } from '../domain/mcp-bug-stats';

/** Danh sách sprint của một team. */
export class McpListCyclesDto {
  @ApiProperty({ description: 'Tên hoặc id team' })
  @IsString()
  team!: string;

  @ApiPropertyOptional({ description: 'Số sprint trả về, mặc định 10', minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Burn-up của một sprint. */
export class McpCycleBurndownDto {
  @ApiProperty({ description: 'Tên hoặc id team' })
  @IsString()
  team!: string;

  @ApiProperty({ description: "Số hiệu, tên, id, hoặc 'current' / 'next' / 'last'" })
  @IsString()
  cycle!: string;
}

/** Velocity qua nhiều sprint đã đóng. */
export class McpTeamVelocityDto {
  @ApiProperty({ description: 'Tên hoặc id team' })
  @IsString()
  team!: string;

  @ApiPropertyOptional({ description: 'Số sprint đã đóng gần nhất, mặc định 6', minimum: 1, maximum: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  cycles?: number;
}

/** Phân bố bug. Mọi trường đều tuỳ chọn — không có gì thì thống kê toàn workspace
 *  theo status + severity. */
export class McpBugStatsDto {
  @ApiPropertyOptional({ description: 'Tên hoặc id team bug; bỏ trống = cả workspace' })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({ description: 'Bug được mở từ ngày này (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  since?: string;

  @ApiPropertyOptional({ description: 'Bug được mở đến ngày này (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  until?: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: BUG_STAT_DIMENSIONS,
    description: 'Chiều gom nhóm; mặc định status + severity',
  })
  @IsOptional()
  // `?groupBy=status&groupBy=severity` arrives as an array, but a single
  // `?groupBy=status` arrives as a bare string — coerce before `@IsArray()`
  // runs, or a lone value fails validation before the handler ever sees it.
  @Transform(({ value }) => (value === undefined ? value : [value].flat()))
  @IsArray()
  groupBy?: BugStatDimension[];

  @ApiPropertyOptional({ enum: ['week', 'month'], description: 'Thêm dòng mở/đóng theo mốc' })
  @IsOptional()
  @IsIn(['week', 'month'])
  trend?: 'week' | 'month';
}

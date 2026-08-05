import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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

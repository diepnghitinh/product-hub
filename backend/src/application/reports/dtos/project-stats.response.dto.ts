import { ApiProperty } from '@nestjs/swagger';

/** Report rollup counts for a single project (feeds Dashboard cards + Overview). */
export class ProjectStatsResponseDto {
  @ApiProperty()
  projectId: string;

  @ApiProperty()
  reportsTotal: number;

  @ApiProperty()
  reportsDone: number;

  @ApiProperty()
  reportsTesting: number;

  @ApiProperty()
  reportsInfo: number;

  @ApiProperty({ description: 'done / total, 0–100' })
  progress: number;
}

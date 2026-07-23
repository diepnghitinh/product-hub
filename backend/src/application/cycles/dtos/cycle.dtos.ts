import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  CYCLE_COOLDOWN_WEEKS_MAX,
  CYCLE_COOLDOWN_WEEKS_MIN,
  CYCLE_LENGTH_WEEKS_MAX,
  CYCLE_LENGTH_WEEKS_MIN,
  CycleStatus,
} from '../domain/enums/cycle.enums';

/** Patch a team's cycle rhythm. Every field optional; enabling seeds cycles,
 *  disabling deletes the upcoming ones (issues drop back to no-cycle). */
export class UpdateTeamCycleConfigDto {
  @ApiPropertyOptional({ description: 'Turn the automatic sprint rhythm on/off' })
  @IsOptional()
  @IsBoolean()
  cyclesEnabled?: boolean;

  @ApiPropertyOptional({ minimum: CYCLE_LENGTH_WEEKS_MIN, maximum: CYCLE_LENGTH_WEEKS_MAX, default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(CYCLE_LENGTH_WEEKS_MIN)
  @Max(CYCLE_LENGTH_WEEKS_MAX)
  cycleLengthWeeks?: number;

  @ApiPropertyOptional({
    minimum: CYCLE_COOLDOWN_WEEKS_MIN,
    maximum: CYCLE_COOLDOWN_WEEKS_MAX,
    default: 0,
    description: 'Gap between cycles with no current cycle at all',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(CYCLE_COOLDOWN_WEEKS_MIN)
  @Max(CYCLE_COOLDOWN_WEEKS_MAX)
  cycleCooldownWeeks?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 7, default: 1, description: '1 = Monday … 7 = Sunday' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  cycleStartDay?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'When a cycle ends, unfinished issues move to the next cycle (off: back to no-cycle)',
  })
  @IsOptional()
  @IsBoolean()
  cycleAutoRollover?: boolean;
}

/** Flat cycle shape. Scope/completed are live rollups while upcoming/active and
 *  the frozen history once completed. */
export class CycleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  teamId: string;

  @ApiProperty({ description: 'Auto-incremented per team: Cycle 1, 2, 3…' })
  number: number;

  @ApiProperty({ description: 'ISO YYYY-MM-DD, inclusive' })
  startDate: string;

  @ApiProperty({ description: 'ISO YYYY-MM-DD, inclusive' })
  endDate: string;

  @ApiProperty({ enum: CycleStatus, description: 'Derived from the dates on read' })
  status: CycleStatus;

  @ApiProperty({ description: 'Issues in the cycle' })
  scopeCount: number;

  @ApiProperty({ description: 'Story points in the cycle (0 on bug teams — no estimates)' })
  scopePoints: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  completedPoints: number;

  @ApiProperty({
    description:
      'Frozen at close: ids of the issues the boundary sweep moved away — the ' +
      '"planned here but unfinished" list. [] while open, and [] on cycles closed ' +
      'before this field existed (only their counts survive).',
    isArray: true,
    type: String,
  })
  unfinishedIds: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/** One day of the burn-up: cumulative scope/started/completed, both units carried
 *  so the client renders whichever the team estimates in. */
export class CycleBurndownPointDto {
  @ApiProperty({ description: 'ISO YYYY-MM-DD' })
  date: string;

  @ApiProperty()
  scopeCount: number;

  @ApiProperty()
  scopePoints: number;

  @ApiProperty()
  startedCount: number;

  @ApiProperty()
  startedPoints: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  completedPoints: number;
}

/** A breakdown bucket — one assignee, label, or project — as a current snapshot.
 *  `key` is '' for the "none" bucket; `label`/`color` are '' when the client
 *  resolves them (projects). */
export class CycleBurndownGroupDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  color: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  points: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  completedPoints: number;
}

/**
 * A cycle's burn-up: the reconstructed daily series plus current totals and
 * breakdowns. The completed/started curves are approximated from issue
 * `updatedAt` (there is no status history), so they read as "best known", not an
 * audited log. `startedColor`/`completedColor` come from the team's own board
 * columns, so the chart matches the board's status dots.
 */
export class CycleBurndownResponseDto {
  @ApiProperty()
  cycleId: string;

  @ApiProperty({ description: 'Cycle number within the team' })
  number: number;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty({ enum: CycleStatus })
  status: CycleStatus;

  @ApiProperty({ enum: ['points', 'count'], description: 'Which unit the team tracks in' })
  unit: 'points' | 'count';

  @ApiProperty()
  scopeCount: number;

  @ApiProperty()
  scopePoints: number;

  @ApiProperty()
  startedCount: number;

  @ApiProperty()
  startedPoints: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  completedPoints: number;

  @ApiProperty({ description: 'Hex colour of the team’s first started column' })
  startedColor: string;

  @ApiProperty({ description: 'Hex colour of the team’s done column' })
  completedColor: string;

  @ApiProperty({ type: [CycleBurndownPointDto] })
  series: CycleBurndownPointDto[];

  @ApiProperty({ type: [CycleBurndownGroupDto] })
  assignees: CycleBurndownGroupDto[];

  @ApiProperty({ type: [CycleBurndownGroupDto] })
  labels: CycleBurndownGroupDto[];

  @ApiProperty({ type: [CycleBurndownGroupDto] })
  projects: CycleBurndownGroupDto[];
}

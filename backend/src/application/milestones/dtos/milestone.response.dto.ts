import { ApiProperty } from '@nestjs/swagger';
import { MilestoneStatus } from '../domain/milestone.types';

export class KeyResultDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() progress: number;
  @ApiProperty() owner: string;
  @ApiProperty({ description: 'Share (%) of the objective. Siblings always sum to 100.' })
  weight: number;
  @ApiProperty({ description: 'Held steady while siblings rebalance' }) locked: boolean;
  @ApiProperty() status: string;
}

export class ObjectiveDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: [KeyResultDto] }) keyResults: KeyResultDto[];
  @ApiProperty({ description: 'Always 100 — an objective owns all of its own scope' })
  weight: number;
  @ApiProperty() status: string;
  @ApiProperty() notes: string;
  @ApiProperty({ description: 'Weighted rollup of this objective’s key results' }) progress: number;
}

/** Flat milestone shape with per-objective + overall progress rollups. */
export class MilestoneResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() title: string;
  @ApiProperty() timeframe: string;
  @ApiProperty({ enum: MilestoneStatus }) status: MilestoneStatus;
  @ApiProperty({ type: [ObjectiveDto] }) objectives: ObjectiveDto[];
  @ApiProperty({ type: [String] }) roadmapIds: string[];
  @ApiProperty({ description: 'Overall progress (avg of all key results)' }) progress: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

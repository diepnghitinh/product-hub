import { ApiProperty } from '@nestjs/swagger';
import {
  RoadmapDifficulty,
  RoadmapItemStatus,
  RoadmapPhase,
} from '../domain/enums/roadmap.enums';

/** A roadmap item with its derived RICE score. */
export class RoadmapItemDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ enum: RoadmapPhase }) phase: RoadmapPhase;
  @ApiProperty({ enum: RoadmapItemStatus }) status: RoadmapItemStatus;
  @ApiProperty({ enum: RoadmapDifficulty }) difficulty: RoadmapDifficulty;
  @ApiProperty() reach: number;
  @ApiProperty() impact: number;
  @ApiProperty() confidence: number;
  @ApiProperty() effort: number;
  @ApiProperty() progress: number;
  @ApiProperty({ description: 'Derived RICE score' }) rice: number;
}

/** Flat roadmap shape. */
export class RoadmapResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() projectId: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: [RoadmapItemDto] }) items: RoadmapItemDto[];
  @ApiProperty() itemCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

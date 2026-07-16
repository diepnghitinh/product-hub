import { ApiProperty } from '@nestjs/swagger';
import { RoadmapDifficulty, RoadmapItemStatus } from '../domain/enums/roadmap.enums';

/** A person assigned to a roadmap item (denormalized id + name). */
export class RoadmapItemAssigneeDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

/** A configurable board column ("pool"). */
export class RoadmapColumnDto {
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty() color: string;
}

/** A roadmap item with its derived RICE score. */
export class RoadmapItemDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() phase: string;
  @ApiProperty({ enum: RoadmapItemStatus }) status: RoadmapItemStatus;
  @ApiProperty({ enum: RoadmapDifficulty }) difficulty: RoadmapDifficulty;
  @ApiProperty() reach: number;
  @ApiProperty() impact: number;
  @ApiProperty() confidence: number;
  @ApiProperty() effort: number;
  @ApiProperty() progress: number;
  @ApiProperty() imageUrl: string;
  @ApiProperty() startDate: string;
  @ApiProperty({ type: [RoadmapItemAssigneeDto] }) assignees: RoadmapItemAssigneeDto[];
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
  @ApiProperty({ type: [RoadmapColumnDto] }) columns: RoadmapColumnDto[];
  @ApiProperty() itemCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

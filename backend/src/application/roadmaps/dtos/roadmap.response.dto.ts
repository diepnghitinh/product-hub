import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoadmapDifficulty, RoadmapItemStatus } from '../domain/enums/roadmap.enums';

/** A person assigned to a roadmap item (denormalized id + name). */
export class RoadmapItemAssigneeDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

/** A file attached to a roadmap item (a snapshot of the upload result). */
export class RoadmapItemAttachmentDto {
  @ApiProperty() url: string;
  @ApiProperty() name: string;
  @ApiProperty() contentType: string;
  @ApiProperty() size: number;
}

/** A configurable board column ("pool"). */
export class RoadmapColumnDto {
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty() color: string;
}

/** A named, coloured group of backlog items ("Checkout revamp"). */
export class RoadmapEpicDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty() color: string;
  @ApiProperty({ description: 'One line of context; empty when unset' })
  description: string;
}

/** A roadmap item with its derived RICE score. */
export class RoadmapItemDto {
  @ApiProperty() id: string;
  @ApiProperty({
    example: 'RM-6HCUHKX',
    description: 'Human-friendly ref used in the item URL. Empty for legacy items.',
  })
  shortId: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() phase: string;
  @ApiProperty({ description: 'Id of the epic this item is grouped under; empty when ungrouped' })
  epicId: string;
  @ApiProperty({ enum: RoadmapItemStatus }) status: RoadmapItemStatus;
  @ApiProperty({ enum: RoadmapDifficulty }) difficulty: RoadmapDifficulty;
  @ApiProperty() reach: number;
  @ApiProperty() impact: number;
  @ApiProperty() confidence: number;
  @ApiProperty() effort: number;
  @ApiProperty() progress: number;
  @ApiProperty() imageUrl: string;
  @ApiProperty() startDate: string;
  @ApiProperty({ description: 'Target end date (YYYY-MM-DD), empty when unset' })
  endDate: string;
  @ApiProperty({ type: [RoadmapItemAssigneeDto] }) assignees: RoadmapItemAssigneeDto[];
  @ApiProperty({
    type: [RoadmapItemAttachmentDto],
    description: 'Files attached to the item. Always empty on the public share view.',
  })
  attachments: RoadmapItemAttachmentDto[];
  @ApiProperty({ description: 'Derived RICE score' }) rice: number;
  @ApiProperty({ description: 'When the item was created (ISO)' }) createdAt: string;
  @ApiPropertyOptional({ description: 'When work first started (ISO), once In progress' })
  startedAt?: string;
  @ApiPropertyOptional({ description: 'When the item was completed (ISO), once Done' })
  completedAt?: string;
  @ApiProperty({ description: 'Linked OKR milestone id, empty when unlinked' })
  milestoneId: string;
  @ApiProperty({ description: 'Linked OKR objective id, empty when unlinked' })
  objectiveId: string;
  @ApiProperty({ description: 'Linked key result id, empty when linked at objective level' })
  keyResultId: string;
  @ApiProperty({ description: 'Denormalized OKR label shown on the card' })
  okrLabel: string;
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
  @ApiProperty({ type: [RoadmapEpicDto] }) epics: RoadmapEpicDto[];
  @ApiProperty() itemCount: number;
  @ApiProperty() publicEnabled: boolean;
  @ApiProperty({ nullable: true }) publicToken: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

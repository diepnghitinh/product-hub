import { ApiProperty } from '@nestjs/swagger';
import { Environment } from '../domain/enums/environment.enum';

/**
 * Public project shape. Flat by convention — the Dashboard-card rollups
 * (`reportsTotal` … `progress`) are inlined here rather than nested. Those
 * counters are populated once reports exist (Phase 2); until then they are 0.
 */
export class ProjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  subtitle: string;

  @ApiProperty()
  owner: string;

  @ApiProperty()
  createdBy: string;

  @ApiProperty({ type: [String] })
  sharedWith: string[];

  @ApiProperty()
  pinned: boolean;

  @ApiProperty({ enum: Environment })
  environment: Environment;

  @ApiProperty()
  publicEnabled: boolean;

  @ApiProperty({ nullable: true })
  publicToken: string | null;

  @ApiProperty()
  archived: boolean;

  // ── Dashboard rollups (flat; 0 until reports land in Phase 2) ──────────────
  @ApiProperty()
  reportsTotal: number;

  @ApiProperty()
  reportsDone: number;

  @ApiProperty()
  reportsTesting: number;

  @ApiProperty()
  reportsInfo: number;

  @ApiProperty({ description: 'Completion percent (done / total), 0–100' })
  progress: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

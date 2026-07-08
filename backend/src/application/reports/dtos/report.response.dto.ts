import { ApiProperty } from '@nestjs/swagger';
import { FeatureStatus } from '../domain/enums/feature-status.enum';
import { ReportSection } from '../domain/types/section.types';

/** Flat report shape. `sections` is the heterogeneous document body. */
export class ReportResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  groupId: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  subtitle: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  featureId: string;

  @ApiProperty()
  module: string;

  @ApiProperty({ enum: FeatureStatus })
  statusVariant: FeatureStatus;

  @ApiProperty()
  owner: string;

  @ApiProperty()
  reported: string;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  sections: ReportSection[];

  @ApiProperty()
  order: number;

  @ApiProperty()
  caseCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

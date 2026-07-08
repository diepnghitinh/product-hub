import { UniqueEntityID } from '@core/domain';
import { FeatureStatus } from '../enums/feature-status.enum';
import { ReportSection } from '../types/section.types';

export interface ReportProps {
  id: UniqueEntityID;
  tenantId: string;
  projectId: string;
  /** Group this report is filed under (empty string = ungrouped). */
  groupId: string;
  slug: string;
  title: string;
  subtitle: string;
  /** Short sidebar label + optional human feature id / module tag. */
  label: string;
  featureId: string;
  module: string;
  statusVariant: FeatureStatus;
  owner: string;
  reported: string;
  sections: ReportSection[];
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

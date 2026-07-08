import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { FeatureStatus } from '@application/reports/domain/enums/feature-status.enum';
import { ReportSection } from '@application/reports/domain/types/section.types';

export interface ReportDoc {
  _id: string;
  tenantId: string;
  projectId: string;
  groupId: string;
  slug: string;
  title: string;
  subtitle: string;
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

export const ReportSchema = new Schema<ReportDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    groupId: { type: String, default: '' },
    slug: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    subtitle: { type: String, default: '' },
    label: { type: String, default: '' },
    featureId: { type: String, default: '' },
    module: { type: String, default: '' },
    statusVariant: {
      type: String,
      enum: Object.values(FeatureStatus),
      default: FeatureStatus.TESTING,
    },
    owner: { type: String, default: '' },
    reported: { type: String, default: '' },
    // Heterogeneous document body (incl. test cases inside testing sections).
    // Cast: an array of Mixed doesn't line up with the typed `ReportSection[]`
    // field, but that is exactly what it stores.
    sections: { type: [Schema.Types.Mixed], default: [] } as unknown as ReportSection[],
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ReportSchema.index({ tenantId: 1, projectId: 1, slug: 1 }, { unique: true });
// Lookups by a test case's shortId (public API + result dropdown).
ReportSchema.index({ tenantId: 1, projectId: 1, 'sections.cases.shortId': 1 });

import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import {
  RoadmapColumn,
  RoadmapEpic,
  RoadmapItemData,
} from '@application/roadmaps/domain/types/roadmap-item.type';

export interface RoadmapDoc {
  _id: string;
  tenantId: string;
  projectId: string;
  title: string;
  description: string;
  items: RoadmapItemData[];
  columns: RoadmapColumn[];
  /** Linked workspace column template. Absent/null on roadmaps that run their
   *  own columns — including every roadmap that predates templates. */
  columnTemplateId?: string | null;
  epics: RoadmapEpic[];
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const RoadmapSchema = new Schema<RoadmapDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    projectId: { type: String, default: '' },
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: '' },
    items: { type: [Schema.Types.Mixed], default: [] } as unknown as RoadmapItemData[],
    columns: { type: [Schema.Types.Mixed], default: [] } as unknown as RoadmapColumn[],
    columnTemplateId: { type: String, default: null },
    epics: { type: [Schema.Types.Mixed], default: [] } as unknown as RoadmapEpic[],
    publicEnabled: { type: Boolean, default: false },
    publicToken: { type: String, default: null },
  },
  { timestamps: true },
);

import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { BugSeverity, BugStatus } from '@application/bugs/domain/enums/bug.enums';

export interface BugDoc {
  _id: string;
  tenantId: string;
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  type: string;
  projectId: string;
  caseId: string;
  caseLabel: string;
  reportId: string;
  assigneeId: string;
  assigneeName: string;
  reporterId: string;
  reporterName: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export const BugSchema = new Schema<BugDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '' },
    severity: { type: String, enum: Object.values(BugSeverity), default: BugSeverity.MEDIUM },
    status: { type: String, enum: Object.values(BugStatus), default: BugStatus.OPEN },
    type: { type: String, default: '' },
    projectId: { type: String, default: '', index: true },
    caseId: { type: String, default: '', index: true },
    caseLabel: { type: String, default: '' },
    reportId: { type: String, default: '', index: true },
    assigneeId: { type: String, default: '', index: true },
    assigneeName: { type: String, default: '' },
    reporterId: { type: String, default: '' },
    reporterName: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

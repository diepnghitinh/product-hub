import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface DocPageVersionDoc {
  _id: string;
  tenantId: string;
  docId: string;
  pageId: string;
  title: string;
  content: string;
  label: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

export const DocPageVersionSchema = new Schema<DocPageVersionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    docId: { type: String, required: true, index: true },
    pageId: { type: String, required: true },
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    label: { type: String, default: '', maxlength: 120 },
    createdBy: { type: String, default: '' },
    createdByName: { type: String, default: '' },
  },
  // A version is immutable, so only `createdAt` means anything here.
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The history list: one page's versions, newest first.
DocPageVersionSchema.index({ pageId: 1, createdAt: -1 });

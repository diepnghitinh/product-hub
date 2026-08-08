import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

/** One of our boards bound to one ClickUp list. */
export interface ClickUpSyncDoc {
  _id: string;
  tenantId: string;
  scope: string;
  scopeId: string;
  listId: string;
  listName: string;
  spaceId: string;
  spaceName: string;
  enabled: boolean;
  statusMap: { key: string; clickupStatus: string }[];
  createdAt: Date;
  updatedAt: Date;
}

export const ClickUpSyncSchema = new Schema<ClickUpSyncDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true },
    scope: { type: String, required: true },
    scopeId: { type: String, required: true },
    listId: { type: String, required: true },
    listName: { type: String, default: '' },
    spaceId: { type: String, default: '' },
    spaceName: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    // Stored as given, including the '' entries: a column deliberately left
    // unmapped is a decision, and dropping it would make the row reappear as an
    // unanswered question every time the form is opened.
    statusMap: {
      type: [{ _id: false, key: String, clickupStatus: String }],
      default: [],
    },
  },
  { timestamps: true },
);

// One binding per board. A team pointing at two ClickUp lists has no meaning —
// a new task would have to be created in both — so the database says so.
ClickUpSyncSchema.index({ tenantId: 1, scope: 1, scopeId: 1 }, { unique: true });

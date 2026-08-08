import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface ClickUpLinkDoc {
  _id: string;
  tenantId: string;
  clickupTaskId: string;
  targetType: string;
  targetId: string;
  roadmapId: string;
  origin: string;
  pushedStatus: string;
  // ── the mirrored snapshot ──
  taskName: string;
  taskUrl: string;
  customId: string;
  status: string;
  statusColor: string;
  statusType: string;
  assignees: string[];
  priority: string;
  dueDate: string;
  listName: string;
  spaceName: string;
  unavailableReason: string;
  lastSyncedAt: Date;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ClickUpLinkSchema = new Schema<ClickUpLinkDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true },
    clickupTaskId: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    roadmapId: { type: String, default: '' },
    // `manual` is the right default for a document written before bound boards
    // existed: it was a pasted link, and pasted links are never written to.
    origin: { type: String, default: 'manual' },
    pushedStatus: { type: String, default: '' },
    taskName: { type: String, default: '' },
    taskUrl: { type: String, default: '' },
    customId: { type: String, default: '' },
    status: { type: String, default: '' },
    statusColor: { type: String, default: '' },
    statusType: { type: String, default: '' },
    assignees: { type: [String], default: [] },
    priority: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    listName: { type: String, default: '' },
    spaceName: { type: String, default: '' },
    unavailableReason: { type: String, default: '' },
    lastSyncedAt: { type: Date, default: () => new Date() },
    createdBy: { type: String, default: '' },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);

// One link per (task, record) — the safety net behind create, which upserts on
// exactly this key so re-pasting the same URL refreshes rather than duplicates.
ClickUpLinkSchema.index(
  { tenantId: 1, targetType: 1, targetId: 1, clickupTaskId: 1 },
  { unique: true },
);
// Rendering a record's panel, and the batch read behind a list of records.
ClickUpLinkSchema.index({ tenantId: 1, targetType: 1, targetId: 1 });
// The inbound leg: a delivery names a ClickUp task and nothing else, so this is
// the lookup that finds everything to re-stamp on every event.
ClickUpLinkSchema.index({ tenantId: 1, clickupTaskId: 1 });

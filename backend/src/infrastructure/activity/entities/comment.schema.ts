import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface CommentDoc {
  _id: string;
  tenantId: string;
  bugId: string;
  taskId: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const CommentSchema = new Schema<CommentDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    // A comment is on a bug OR a task — one is set, the other ''.
    bugId: { type: String, default: '', index: true },
    taskId: { type: String, default: '', index: true },
    authorId: { type: String, default: '' },
    authorName: { type: String, default: '' },
    body: { type: String, required: true },
    mentions: { type: [String], default: [], index: true },
    images: { type: [String], default: [] },
    // Managed by the domain entity (equals createdAt until edited).
    updatedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

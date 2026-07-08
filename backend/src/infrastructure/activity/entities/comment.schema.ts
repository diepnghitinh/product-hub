import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface CommentDoc {
  _id: string;
  tenantId: string;
  bugId: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  images: string[];
  createdAt: Date;
}

export const CommentSchema = new Schema<CommentDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    bugId: { type: String, required: true, index: true },
    authorId: { type: String, default: '' },
    authorName: { type: String, default: '' },
    body: { type: String, required: true },
    mentions: { type: [String], default: [], index: true },
    images: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

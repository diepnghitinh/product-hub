import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface CommentDoc {
  _id: string;
  tenantId: string;
  issueId: string;
  bugId: string;
  taskId: string;
  roadmapItemId: string;
  docId: string;
  docPageId: string;
  anchorExact: string;
  anchorPrefix: string;
  anchorSuffix: string;
  anchorStart: number;
  resolved: boolean;
  resolvedById: string;
  resolvedByName: string;
  resolvedAt: Date | null;
  parentId: string;
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
    // A comment is on an issue OR a roadmap item. `issueId` is the canonical
    // subject id (the issue's shared _id); `bugId`/`taskId` are legacy mirrors
    // kept for the inbox + reversibility (one is set to issueId, the other '').
    issueId: { type: String, default: '', index: true },
    bugId: { type: String, default: '', index: true },
    taskId: { type: String, default: '', index: true },
    roadmapItemId: { type: String, default: '', index: true },
    // A doc-page comment. `docPageId` is the subject; `docId` rides along so the
    // rail's per-page counts are one query against the doc rather than one per page.
    docId: { type: String, default: '', index: true },
    docPageId: { type: String, default: '', index: true },
    // Where in the page the comment points, as a text quote rather than an offset:
    // the selected text plus a little context either side. Positions shift on every
    // edit — the quote survives them, and when the quoted text is finally deleted
    // the comment goes orphaned instead of silently pointing at a different
    // sentence. `anchorStart` is the plain-text offset at the time of writing, kept
    // only to break ties when the same phrase appears more than once.
    anchorExact: { type: String, default: '' },
    anchorPrefix: { type: String, default: '' },
    anchorSuffix: { type: String, default: '' },
    anchorStart: { type: Number, default: -1 },
    // Resolving hides a thread's highlight from the page and files it under
    // "Resolved" — set on the root comment; replies follow their root.
    resolved: { type: Boolean, default: false, index: true },
    resolvedById: { type: String, default: '' },
    resolvedByName: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
    // '' for a top-level comment; otherwise the id of the comment it replies to.
    parentId: { type: String, default: '', index: true },
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

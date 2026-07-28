import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { DocFontSize, DocFontStyle, DocPageWidth } from '@application/docs/domain/enums/doc.enums';
import { DocAttachment } from '@application/docs/domain/types/doc-attachment.type';
import { DocLinkRef } from '@application/docs/domain/types/doc-link.type';

export interface DocPageDoc {
  _id: string;
  tenantId: string;
  docId: string;
  parentId: string;
  title: string;
  icon: string;
  color: string | null;
  coverUrl: string;
  content: string;
  links: DocLinkRef[];
  attachments: DocAttachment[];
  fontStyle: DocFontStyle;
  fontSize: DocFontSize;
  pageWidth: DocPageWidth;
  showCover: boolean;
  showTitle: boolean;
  showUpdated: boolean;
  showLinks: boolean;
  showAttachments: boolean;
  order: number;
  createdBy: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export const DocPageSchema = new Schema<DocPageDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    docId: { type: String, required: true, index: true },
    parentId: { type: String, default: '' },
    title: { type: String, required: true, maxlength: 300 },
    icon: { type: String, default: '' },
    color: { type: String, default: null },
    coverUrl: { type: String, default: '' },
    content: { type: String, default: '' },
    links: { type: [Schema.Types.Mixed], default: [] } as unknown as DocLinkRef[],
    attachments: { type: [Schema.Types.Mixed], default: [] } as unknown as DocAttachment[],
    // Page Styles. No `default:` on purpose — an absent field is what tells the
    // entity "this page predates Page Styles", and its getters answer with the
    // defaults. Writing defaults here would only backfill on the next save anyway.
    fontStyle: { type: String, enum: Object.values(DocFontStyle) },
    fontSize: { type: String, enum: Object.values(DocFontSize) },
    pageWidth: { type: String, enum: Object.values(DocPageWidth) },
    showCover: { type: Boolean },
    showTitle: { type: Boolean },
    showUpdated: { type: Boolean },
    showLinks: { type: Boolean },
    showAttachments: { type: Boolean },
    order: { type: Number, default: 0 },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true },
);

// The "docs attached to this issue / roadmap item" lookup — without it that read
// is a full scan of every page in the database.
DocPageSchema.index({ tenantId: 1, 'links.refId': 1 });

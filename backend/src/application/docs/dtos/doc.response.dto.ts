import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocFontSize,
  DocFontStyle,
  DocLinkKind,
  DocPageWidth,
} from '../domain/enums/doc.enums';

/** A record a page is attached to (denormalized — see `DocLinkRef`). */
export class DocLinkDto {
  @ApiProperty({ enum: DocLinkKind }) kind: DocLinkKind;
  @ApiProperty() refId: string;
  @ApiProperty() title: string;
  @ApiProperty({ description: 'Owning roadmap id — roadmap-item links only' }) roadmapId: string;
  @ApiProperty({ description: 'bug | task — issue links only' }) issueKind: string;
}

/** A file attached to a page — a snapshot of the upload (see `DocAttachment`). */
export class DocAttachmentDto {
  @ApiProperty() url: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'Stored MIME type — drives the icon' }) contentType: string;
  @ApiProperty({ description: 'Bytes' }) size: number;
}

/**
 * A page as the left rail needs it: everything but the body. The tree is
 * returned flat (`parentId` + `order`) and assembled client-side.
 */
export class DocPageSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() docId: string;
  @ApiProperty({ description: '"" = a top-level page' }) parentId: string;
  @ApiProperty() title: string;
  @ApiProperty() icon: string;
  /** Symbol accent; null = inherit. */
  @ApiProperty({ nullable: true }) color: string | null;
  @ApiProperty() order: number;
  @ApiProperty({ description: 'How many records this page is attached to' }) linkCount: number;
  @ApiProperty() updatedByName: string;
  @ApiProperty() updatedAt: Date;
}

/** A page with its body — what the editor loads. */
export class DocPageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() docId: string;
  @ApiProperty() parentId: string;
  @ApiProperty() title: string;
  @ApiProperty() icon: string;
  @ApiProperty({ nullable: true }) color: string | null;
  @ApiProperty() coverUrl: string;
  @ApiProperty({ description: 'The page body as HTML' }) content: string;
  @ApiProperty({ type: [DocLinkDto] }) links: DocLinkDto[];
  @ApiProperty({ type: [DocAttachmentDto] }) attachments: DocAttachmentDto[];
  // Page Styles, always populated — a page stored before they existed answers
  // with the defaults rather than with nulls the client would have to handle.
  @ApiProperty({ enum: DocFontStyle }) fontStyle: DocFontStyle;
  @ApiProperty({ enum: DocFontSize }) fontSize: DocFontSize;
  @ApiProperty({ enum: DocPageWidth }) pageWidth: DocPageWidth;
  @ApiProperty() showCover: boolean;
  @ApiProperty() showTitle: boolean;
  @ApiProperty() showUpdated: boolean;
  @ApiProperty() showLinks: boolean;
  @ApiProperty() showAttachments: boolean;
  @ApiProperty() order: number;
  @ApiProperty() createdBy: string;
  @ApiProperty() updatedBy: string;
  @ApiProperty() updatedByName: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

/** Flat doc shape. `pages` is filled on a single-doc read and empty in the list. */
export class DocResponseDto {
  @ApiProperty() id: string;
  /** URL handle, `DOC-6HCUHKX`. '' on docs created before refs existed. */
  @ApiProperty({ example: 'DOC-6HCUHKX' }) ref: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() title: string;
  @ApiProperty() icon: string;
  @ApiProperty({ nullable: true }) color: string | null;
  @ApiProperty() coverUrl: string;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty() createdBy: string;
  @ApiProperty() createdByName: string;
  @ApiProperty({ description: 'Private to its author (and admins) — see DocEntity.isVisibleTo' })
  isPrivate: boolean;
  @ApiProperty() publicEnabled: boolean;
  @ApiProperty({ nullable: true }) publicToken: string | null;
  @ApiProperty() pageCount: number;
  @ApiProperty({ type: [DocPageSummaryDto] }) pages: DocPageSummaryDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

/**
 * A doc page seen from the record it's attached to — enough for the "Docs"
 * section on an issue or roadmap item to render a link without a second fetch.
 */
export class LinkedDocPageDto {
  @ApiProperty() docId: string;
  @ApiProperty({ description: "The doc's short ref — what the link is addressed by" })
  docRef: string;
  @ApiProperty() docTitle: string;
  @ApiProperty() pageId: string;
  @ApiProperty() pageTitle: string;
  @ApiProperty() pageIcon: string;
  @ApiProperty({ nullable: true }) pageColor: string | null;
  @ApiProperty() updatedByName: string;
  @ApiProperty() updatedAt: Date;
}

/**
 * One saved version as the history list needs it — no body, so opening the
 * panel on a long page costs one small response instead of every draft ever kept.
 */
export class DocPageVersionSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() docId: string;
  @ApiProperty() pageId: string;
  @ApiProperty({ description: "The page's title when the version was saved" }) title: string;
  @ApiProperty({ description: "What the author called it ('' = untitled save)" }) label: string;
  @ApiProperty({ description: 'Characters of HTML — a rough sense of size' }) contentLength: number;
  @ApiProperty() createdBy: string;
  @ApiProperty() createdByName: string;
  @ApiProperty() createdAt: Date;
}

/** A version with its body — what previewing an old version reads. */
export class DocPageVersionResponseDto extends DocPageVersionSummaryDto {
  @ApiProperty({ description: 'The page body as it stood, as HTML' }) content: string;
}

/** The public (tokened) read-only view: the doc plus every page's body. */
export class PublicDocResponseDto extends DocResponseDto {
  @ApiPropertyOptional({ type: [DocPageResponseDto] })
  fullPages: DocPageResponseDto[];
}

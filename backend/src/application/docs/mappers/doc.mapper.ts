import { DocEntity } from '../domain/entities/doc.entity';
import { DocPageEntity } from '../domain/entities/doc-page.entity';
import { DocPageVersionEntity } from '../domain/entities/doc-page-version.entity';
import { DocLinkRef } from '../domain/types/doc-link.type';
import {
  DocLinkDto,
  DocPageResponseDto,
  DocPageSummaryDto,
  DocPageVersionResponseDto,
  DocPageVersionSummaryDto,
  DocResponseDto,
  LinkedDocPageDto,
} from '../dtos/doc.response.dto';

export class DocMapper {
  /** Optional location fields become '' rather than undefined — flat response shape. */
  static toLinkDto(link: DocLinkRef): DocLinkDto {
    return {
      kind: link.kind,
      refId: link.refId,
      title: link.title,
      roadmapId: link.roadmapId ?? '',
      issueKind: link.issueKind ?? '',
    };
  }

  static toPageSummaryDto(page: DocPageEntity): DocPageSummaryDto {
    return {
      id: page.id.toString(),
      docId: page.docId,
      parentId: page.parentId,
      title: page.title,
      icon: page.icon,
      color: page.color,
      order: page.order,
      linkCount: page.links.length,
      updatedByName: page.updatedByName,
      updatedAt: page.updatedAt,
    };
  }

  static toPageResponseDto(page: DocPageEntity): DocPageResponseDto {
    return {
      id: page.id.toString(),
      tenantId: page.tenantId,
      docId: page.docId,
      parentId: page.parentId,
      title: page.title,
      icon: page.icon,
      color: page.color,
      coverUrl: page.coverUrl,
      content: page.content,
      links: page.links.map((l) => this.toLinkDto(l)),
      attachments: page.attachments.map((a) => ({
        url: a.url,
        name: a.name,
        contentType: a.contentType ?? '',
        size: a.size ?? 0,
      })),
      fontStyle: page.fontStyle,
      fontSize: page.fontSize,
      pageWidth: page.pageWidth,
      showCover: page.showCover,
      showTitle: page.showTitle,
      showUpdated: page.showUpdated,
      showLinks: page.showLinks,
      showAttachments: page.showAttachments,
      order: page.order,
      createdBy: page.createdBy,
      updatedBy: page.updatedBy,
      updatedByName: page.updatedByName,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  }

  static toResponseDto(doc: DocEntity, pages: DocPageEntity[] = []): DocResponseDto {
    return {
      id: doc.id.toString(),
      ref: doc.ref,
      tenantId: doc.tenantId,
      title: doc.title,
      icon: doc.icon,
      color: doc.color,
      coverUrl: doc.coverUrl,
      tags: doc.tags,
      createdBy: doc.createdBy,
      createdByName: doc.createdByName,
      publicEnabled: doc.publicEnabled,
      publicToken: doc.publicToken,
      pageCount: pages.length,
      pages: pages.map((p) => this.toPageSummaryDto(p)),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /** The hub list: no pages travel, so the count is passed in separately. */
  static toListDto(doc: DocEntity, pageCount: number): DocResponseDto {
    return { ...this.toResponseDto(doc), pageCount };
  }

  static toVersionSummaryDto(version: DocPageVersionEntity): DocPageVersionSummaryDto {
    return {
      id: version.id.toString(),
      docId: version.docId,
      pageId: version.pageId,
      title: version.title,
      label: version.label,
      contentLength: version.content.length,
      createdBy: version.createdBy,
      createdByName: version.createdByName,
      createdAt: version.createdAt,
    };
  }

  static toVersionResponseDto(version: DocPageVersionEntity): DocPageVersionResponseDto {
    return { ...this.toVersionSummaryDto(version), content: version.content };
  }

  static toLinkedPageDto(page: DocPageEntity, docTitle: string, docRef: string): LinkedDocPageDto {
    return {
      docId: page.docId,
      docRef,
      docTitle,
      pageId: page.id.toString(),
      pageTitle: page.title,
      pageIcon: page.icon,
      pageColor: page.color,
      updatedByName: page.updatedByName,
      updatedAt: page.updatedAt,
    };
  }
}

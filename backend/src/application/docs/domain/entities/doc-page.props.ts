import { UniqueEntityID } from '@core/domain';
import { DocFontSize, DocFontStyle, DocPageWidth } from '../enums/doc.enums';
import { DocAttachment } from '../types/doc-attachment.type';
import { DocLinkRef } from '../types/doc-link.type';

export interface DocPageProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The doc this page belongs to. A page never moves between docs. */
  docId: string;
  /** The page this one is nested under ('' = a top-level page of the doc). */
  parentId: string;
  title: string;
  /** Symbol shown in the page tree (a `TEAM_ICONS` name); '' = the default page glyph. */
  icon: string;
  /** Accent the symbol is drawn in (a `TEAM_COLORS` value); null = inherit. */
  color: string | null;
  /** Optional banner image above the page title ('' when unset). */
  coverUrl: string;
  /** The page body as HTML — the same shape `RichTextEditor` reads and writes. */
  content: string;
  /** Records this page is attached to (issues, roadmap items). */
  links: DocLinkRef[];
  /** Files attached to this page (PDFs, Office documents), newest last. */
  attachments: DocAttachment[];
  /**
   * Page Styles — how this page is set and which parts of its header show.
   * Flat rather than a nested `style` object so the update DTO can patch one
   * switch without the client having to send the other seven back.
   */
  fontStyle: DocFontStyle;
  fontSize: DocFontSize;
  pageWidth: DocPageWidth;
  /** Show the banner image (the page keeps its `coverUrl` either way). */
  showCover: boolean;
  /** Show the icon + title heading. Off, the title is still edited from the rail. */
  showTitle: boolean;
  /** Show the "updated by … " byline. */
  showUpdated: boolean;
  /** Show the linked-records row. */
  showLinks: boolean;
  /** Show the attachments row. */
  showAttachments: boolean;
  /** Position among its siblings (ascending). Gaps are fine. */
  order: number;
  createdBy: string;
  updatedBy: string;
  /** Denormalized so the page byline renders without a user lookup. */
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

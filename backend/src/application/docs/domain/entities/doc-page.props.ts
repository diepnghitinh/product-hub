import { UniqueEntityID } from '@core/domain';
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
  /** Position among its siblings (ascending). Gaps are fine. */
  order: number;
  createdBy: string;
  updatedBy: string;
  /** Denormalized so the page byline renders without a user lookup. */
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

import { UniqueEntityID } from '@core/domain';

export interface DocPageVersionProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The doc that owns the page — lets a doc's whole history be dropped in one query. */
  docId: string;
  /** The page this snapshot was taken from. */
  pageId: string;
  /** The page's title at the moment of the snapshot. */
  title: string;
  /** The page body as HTML, exactly as it stood — a version is never patched. */
  content: string;
  /** What the author called this save ('' = just a timestamp in the list). */
  label: string;
  createdBy: string;
  /** Denormalized so the history list renders without a user lookup. */
  createdByName: string;
  createdAt: Date;
}

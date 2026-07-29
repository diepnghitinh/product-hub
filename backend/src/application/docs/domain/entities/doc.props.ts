import { UniqueEntityID } from '@core/domain';

/** The ref prefix for a doc — `DOC-6HCUHKX`, alongside `TSK-`/`BUG-`/`RM-`. */
export const DOC_REF_PREFIX = 'DOC';

export interface DocProps {
  id: UniqueEntityID;
  tenantId: string;
  /** Human-friendly ref used in the URL and quoted in conversation (`DOC-6HCUHKX`).
   *  The uuid `id` stays the real identity — everything that stores a doc id
   *  (pages, versions, comments, links) keys off it. Empty for docs created
   *  before refs existed, until the `backfill:doc-refs` script runs. */
  ref: string;
  title: string;
  /** Symbol shown beside the doc (a `TEAM_ICONS` name); '' falls back to the default. */
  icon: string;
  /** Accent the symbol is drawn in (a `TEAM_COLORS` value); null = inherit. */
  color: string | null;
  /** Optional banner image at the top of the doc ('' when unset). */
  coverUrl: string;
  /** Free-text labels used to group and filter docs on the hub. */
  tags: string[];
  createdBy: string;
  createdByName: string;
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

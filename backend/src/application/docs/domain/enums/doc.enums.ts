/**
 * What a doc page can be attached to. The string values match `FavouriteKind` and
 * `ReactionTargetType` on purpose — the app keeps one kind enum per domain rather
 * than a single shared "entity kind", so each feature can grow its own list.
 * Mirrored by the frontend `DocLinkKind`.
 */
export enum DocLinkKind {
  /** A bug or a task — both are issues; the concrete kind rides in `issueKind`. */
  Issue = 'issue',
  RoadmapItem = 'roadmap-item',
}

/**
 * How a page is set. These three are *presentation only* — nothing downstream
 * branches on them, so a page that predates them (every value `undefined`) reads
 * exactly as it did before, and the getters fill in the defaults below.
 * Mirrored by the frontend `DocFontStyle` / `DocFontSize` / `DocPageWidth`.
 */
export enum DocFontStyle {
  /** The app's own UI face — the default, and what every existing page has. */
  System = 'system',
  Serif = 'serif',
  Mono = 'mono',
}

export enum DocFontSize {
  Small = 'small',
  Default = 'default',
  Large = 'large',
}

export enum DocPageWidth {
  /** Capped at a comfortable measure (~65 characters). */
  Default = 'default',
  /** Edge to edge — for pages that are mostly a wide table or diagram. */
  Full = 'full',
}

/** What a page looks like before anyone opens Page Styles. */
export const DEFAULT_PAGE_STYLE = {
  fontStyle: DocFontStyle.System,
  fontSize: DocFontSize.Default,
  pageWidth: DocPageWidth.Default,
  showCover: true,
  showTitle: true,
  showUpdated: true,
  showLinks: true,
  showAttachments: true,
} as const;

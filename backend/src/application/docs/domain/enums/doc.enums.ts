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

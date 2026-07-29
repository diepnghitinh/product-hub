/**
 * The kinds of entity a user can pin to their sidebar. The string values are the
 * stored/serialized form and are mirrored by the frontend `FavouriteKind`.
 */
export enum FavouriteKind {
  RoadmapItem = 'roadmap-item',
  /** A bug or task — both are issues. The concrete kind (bug/task) is kept in
   *  `FavouriteRef.issueKind` for routing + the sidebar icon. */
  Issue = 'issue',
  /** A doc — the container, not one of its pages. Opening it lands on the page
   *  you'd get from the hub, and the workspace rewrites the URL to the canonical
   *  `/docs/DOC-…/<page-slug>` from there. */
  Doc = 'doc',
}

/**
 * The kinds of entity that can carry reactions. String values are the
 * stored/serialized form and are mirrored by the frontend `ReactionTargetType`.
 */
export enum ReactionTargetType {
  /** A bug or task — both are issues, keyed by the issue's shared id. */
  Issue = 'issue',
  RoadmapItem = 'roadmap-item',
}

/**
 * The kinds of entity that can carry reactions. String values are the
 * stored/serialized form and are mirrored by the frontend `ReactionTargetType`.
 */
export enum ReactionTargetType {
  Bug = 'bug',
  Task = 'task',
  RoadmapItem = 'roadmap-item',
}

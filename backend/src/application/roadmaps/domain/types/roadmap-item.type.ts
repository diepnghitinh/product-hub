import {
  RoadmapDifficulty,
  RoadmapItemStatus,
  RoadmapPhase,
} from '../enums/roadmap.enums';

/** A person assigned to a roadmap item — denormalized (id + name) so names
 * render without needing the admin-only user list. */
export interface RoadmapAssignee {
  id: string;
  name: string;
}

/** A configurable board column ("pool"). `key` is the stable value stored on
 * each item's `phase`; `label` and `color` are editable per roadmap. */
export interface RoadmapColumn {
  key: string;
  label: string;
  color: string;
}

/** Seeded for roadmaps that have no columns yet (existing + newly created). */
export const DEFAULT_ROADMAP_COLUMNS: RoadmapColumn[] = [
  { key: RoadmapPhase.NOW, label: 'Now', color: 'hsl(248 53% 58%)' },
  { key: RoadmapPhase.NEXT, label: 'Next', color: 'hsl(38 92% 50%)' },
  { key: RoadmapPhase.LATER, label: 'Later', color: 'hsl(220 9% 46%)' },
  { key: RoadmapPhase.DONE, label: 'Done', color: 'hsl(142 55% 40%)' },
];

/** A single roadmap item. RICE score is derived, not stored. */
export interface RoadmapItemData {
  id: string;
  title: string;
  description: string;
  /** The column ("pool") this item sits in — a `RoadmapColumn.key`. */
  phase: string;
  status: RoadmapItemStatus;
  difficulty: RoadmapDifficulty;
  /** RICE inputs. */
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  /** 0–100 completion. */
  progress: number;
  /** Optional cover / UI-reference image URL ('' when unset). */
  imageUrl: string;
  /** Optional start date, ISO `YYYY-MM-DD` ('' when unset). */
  startDate: string;
  /** People assigned (denormalized). */
  assignees: RoadmapAssignee[];
  /** When the item was first created (ISO). Stamped and then preserved
   *  server-side across the wholesale item replace, so reordering or editing
   *  never resets it. Optional because items created before this field existed
   *  have none stored — the mapper backfills those to the roadmap's own date. */
  createdAt?: string;
  /** When the item first entered a started status (in-progress, or straight to
   *  done), ISO. Set once then preserved; absent until work starts. Drives cycle
   *  time (startedAt → completedAt). */
  startedAt?: string;
  /** When the item first reached Done, ISO. Set once then preserved; absent until
   *  completed. Drives lead time (createdAt → completedAt). */
  completedAt?: string;
  /** Linked OKR — the milestone objective (and optionally one specific key result
   *  under it) this item advances. All denormalized so cards render without loading
   *  the milestone: `okrLabel` is the leaf title shown on the card — the key
   *  result's title when one is chosen, else the objective's. Empty strings when the
   *  item isn't linked; `keyResultId` is '' when linked at the objective level. */
  milestoneId: string;
  objectiveId: string;
  keyResultId: string;
  okrLabel: string;
}

/** RICE = (reach × impact × confidence) / effort. Effort 0 → score 0. */
export function riceScore(item: RoadmapItemData): number {
  if (!item.effort || item.effort <= 0) return 0;
  return Math.round((item.reach * item.impact * item.confidence) / item.effort);
}

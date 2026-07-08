import {
  RoadmapDifficulty,
  RoadmapItemStatus,
  RoadmapPhase,
} from '../enums/roadmap.enums';

/** A single roadmap item. RICE score is derived, not stored. */
export interface RoadmapItemData {
  id: string;
  title: string;
  description: string;
  phase: RoadmapPhase;
  status: RoadmapItemStatus;
  difficulty: RoadmapDifficulty;
  /** RICE inputs. */
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  /** 0–100 completion. */
  progress: number;
}

/** RICE = (reach × impact × confidence) / effort. Effort 0 → score 0. */
export function riceScore(item: RoadmapItemData): number {
  if (!item.effort || item.effort <= 0) return 0;
  return Math.round((item.reach * item.impact * item.confidence) / item.effort);
}

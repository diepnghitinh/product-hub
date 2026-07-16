/** Milestone lifecycle status. */
export enum MilestoneStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export interface KeyResultData {
  id: string;
  title: string;
  /** 0–100. */
  progress: number;
  owner: string;
  /** Weight (%) of this key result within its objective. */
  weight: number;
  /** OKR status key ('' = no status). */
  status: string;
}

export interface ObjectiveData {
  id: string;
  title: string;
  keyResults: KeyResultData[];
  /** Weight (%) of this objective within the milestone. */
  weight: number;
  status: string;
  notes: string;
}

/**
 * Weighted average of `{progress, weight}` — falls back to a plain average when
 * no weights are set (total weight 0), so unweighted/legacy data still rolls up.
 */
function weightedAvg(items: { progress: number; weight: number }[]): number {
  if (!items || items.length === 0) return 0;
  const totalW = items.reduce((n, i) => n + (i.weight || 0), 0);
  if (totalW <= 0) {
    return Math.round(items.reduce((n, i) => n + (i.progress || 0), 0) / items.length);
  }
  return Math.round(items.reduce((n, i) => n + (i.progress || 0) * (i.weight || 0), 0) / totalW);
}

/** An objective's progress — its key results weighted by their weight. */
export function objectiveProgress(o: ObjectiveData): number {
  return weightedAvg(
    (o.keyResults ?? []).map((k) => ({ progress: k.progress || 0, weight: k.weight ?? 0 })),
  );
}

/** Milestone rollup — objectives weighted by their weight. */
export function milestoneProgress(objectives: ObjectiveData[]): number {
  return weightedAvg(
    (objectives ?? []).map((o) => ({ progress: objectiveProgress(o), weight: o.weight ?? 0 })),
  );
}

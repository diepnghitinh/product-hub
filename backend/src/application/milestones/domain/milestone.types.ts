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
}

export interface ObjectiveData {
  id: string;
  title: string;
  keyResults: KeyResultData[];
}

/** Average progress across a set of key results (0 when empty). */
export function avgProgress(krs: KeyResultData[]): number {
  if (!krs || krs.length === 0) return 0;
  return Math.round(krs.reduce((n, kr) => n + (kr.progress || 0), 0) / krs.length);
}

/** Milestone rollup — average across every key result in every objective. */
export function milestoneProgress(objectives: ObjectiveData[]): number {
  const all = (objectives ?? []).flatMap((o) => o.keyResults ?? []);
  return avgProgress(all);
}

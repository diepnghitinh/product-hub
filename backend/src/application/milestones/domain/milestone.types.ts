/** Milestone lifecycle status. */
export enum MilestoneStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

/**
 * Every objective owns 100% of its own scope — its key results divide that 100
 * between them. It is a constant rather than a user-editable field: objectives
 * count equally toward the milestone, and the weighting that matters happens one
 * level down, between key results.
 */
export const OBJECTIVE_WEIGHT = 100;

/** Key results within one objective always sum to exactly this. */
export const TOTAL_KR_WEIGHT = 100;

export interface KeyResultData {
  id: string;
  title: string;
  /** 0–100. */
  progress: number;
  owner: string;
  /** Share (%) of its objective. Siblings always sum to `TOTAL_KR_WEIGHT`. */
  weight: number;
  /** Pinned — held steady while its siblings' weights rebalance. */
  locked: boolean;
  /** OKR status key ('' = no status). */
  status: string;
}

export interface ObjectiveData {
  id: string;
  title: string;
  keyResults: KeyResultData[];
  /** Always `OBJECTIVE_WEIGHT`. Stored so the record is self-describing. */
  weight: number;
  status: string;
  notes: string;
}

/** What a client may send — every field but the identity is optional. */
export interface KeyResultInput {
  id: string;
  title: string;
  progress?: number;
  owner?: string;
  weight?: number;
  locked?: boolean;
  status?: string;
}

export interface ObjectiveInput {
  id: string;
  title: string;
  keyResults?: KeyResultInput[];
  weight?: number;
  status?: string;
  notes?: string;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Split `total` into integer shares proportional to `ratios`, summing to exactly
 * `total`. Largest-remainder: the biggest fractional parts collect the leftover
 * points, so 100 across three shares lands on 34/33/33 rather than losing one to
 * rounding. All-zero ratios fall back to an even split.
 */
export function apportion(total: number, ratios: number[]): number[] {
  const n = ratios.length;
  if (n === 0) return [];
  if (total <= 0) return Array<number>(n).fill(0);

  const sum = ratios.reduce((a, b) => a + b, 0);
  const exact = sum > 0 ? ratios.map((r) => (r / sum) * total) : ratios.map(() => total / n);
  const out = exact.map(Math.floor);

  let leftover = total - out.reduce((a, b) => a + b, 0);
  const byFraction = exact
    .map((e, i) => ({ i, fraction: e - Math.floor(e) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let k = 0; leftover > 0; k++, leftover--) out[byFraction[k % n].i]++;

  return out;
}

/** Force a key-result set to sum to exactly 100, preserving existing proportions. */
function normalizeKeyResults(krs: KeyResultInput[]): KeyResultData[] {
  const shares = apportion(
    TOTAL_KR_WEIGHT,
    krs.map((k) => Math.max(0, k.weight ?? 0)),
  );
  return krs.map((k, i) => ({
    id: k.id,
    title: k.title,
    progress: clamp(Math.round(k.progress ?? 0), 0, 100),
    owner: k.owner ?? '',
    status: k.status ?? '',
    locked: k.locked ?? false,
    weight: shares[i],
  }));
}

/**
 * The stored shape's invariants, applied on both read and write: objectives own
 * 100%, their key results divide it. Running this on read as well means records
 * written before the rule existed present the same shape as fresh ones, without
 * a migration.
 */
export function normalizeObjectives(objectives: ObjectiveInput[]): ObjectiveData[] {
  return (objectives ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    status: o.status ?? '',
    notes: o.notes ?? '',
    weight: OBJECTIVE_WEIGHT,
    keyResults: normalizeKeyResults(o.keyResults ?? []),
  }));
}

/** An objective's progress — its key results weighted by their share. */
export function objectiveProgress(o: ObjectiveData): number {
  const krs = o?.keyResults ?? [];
  if (krs.length === 0) return 0;
  const totalW = krs.reduce((n, k) => n + (k.weight || 0), 0);
  // Unweighted data still rolls up rather than reporting a false 0.
  if (totalW <= 0) {
    return Math.round(krs.reduce((n, k) => n + (k.progress || 0), 0) / krs.length);
  }
  return Math.round(krs.reduce((n, k) => n + (k.progress || 0) * (k.weight || 0), 0) / totalW);
}

/** Milestone rollup — every objective counts equally. */
export function milestoneProgress(objectives: ObjectiveData[]): number {
  const list = objectives ?? [];
  if (list.length === 0) return 0;
  return Math.round(list.reduce((n, o) => n + objectiveProgress(o), 0) / list.length);
}

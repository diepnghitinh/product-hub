/**
 * Weight maths for the OKR tree.
 *
 * An objective owns 100% of its own scope; its key results divide that 100
 * between them. Every function here returns a set that sums to exactly
 * `TOTAL_WEIGHT`, so the UI can never build an invalid split. The backend
 * re-applies the same rule on save and is the authority — this exists so the
 * screen can respond instantly and show an honest total.
 */

/** Key results within an objective always divide exactly this much. */
export const TOTAL_WEIGHT = 100;

/**
 * Every objective owns 100% of its own scope, and objectives count equally
 * toward the milestone — so this is shown, not edited. The server pins it.
 */
export const OBJECTIVE_WEIGHT = 100;

export interface WeightItem {
  id: string;
  weight: number;
  /** Held steady while its siblings rebalance. */
  locked?: boolean;
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

/** An even split that still sums to exactly 100 — the default for a fresh set. */
export function distributeEvenly(count: number): number[] {
  return apportion(TOTAL_WEIGHT, Array<number>(count).fill(1));
}

/**
 * Set one key result's weight; its unlocked siblings absorb the difference in
 * proportion to what they already hold.
 *
 * Locked siblings are untouchable, so they cap how far the edited one can go: if
 * two siblings are pinned at 30 each, the rest of the set can only ever share 40.
 * With every sibling pinned there is nothing left to absorb a change, and the
 * edited weight simply snaps to the gap the locks leave behind.
 */
export function setWeight(items: WeightItem[], id: string, desired: number): number[] {
  const target = items.findIndex((k) => k.id === id);
  if (target < 0) return items.map((k) => k.weight);

  const absorbs = items.map((k, i) => i !== target && !k.locked);
  const pinned = items.reduce((n, k, i) => (i !== target && k.locked ? n + k.weight : n), 0);

  const headroom = clamp(TOTAL_WEIGHT - pinned, 0, TOTAL_WEIGHT);
  const canAbsorb = absorbs.some(Boolean);
  const mine = canAbsorb ? clamp(Math.round(desired), 0, headroom) : headroom;

  const shares = apportion(
    headroom - mine,
    items.filter((_, i) => absorbs[i]).map((k) => Math.max(0, k.weight)),
  );

  let s = 0;
  return items.map((k, i) => {
    if (i === target) return mine;
    return absorbs[i] ? shares[s++] : k.weight;
  });
}

/**
 * Move weight across the boundary between `left` and its right-hand neighbour,
 * holding everything else. Zero-sum by construction, which is what lets a
 * divider drag keep the bar exactly full.
 */
export function transfer(weights: number[], left: number, desiredLeft: number): number[] {
  const right = left + 1;
  if (left < 0 || right >= weights.length) return weights;

  const pair = weights[left] + weights[right];
  const next = [...weights];
  next[left] = clamp(Math.round(desiredLeft), 0, pair);
  next[right] = pair - next[left];
  return next;
}

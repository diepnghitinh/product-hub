import {
  KeyResultInput,
  ObjectiveInput,
  apportion,
  milestoneProgress,
  normalizeObjectives,
  objectiveProgress,
} from './milestone.types';

const kr = (over: Partial<KeyResultInput> = {}): KeyResultInput => ({
  id: `kr-${Math.random()}`,
  title: 'KR',
  progress: 0,
  ...over,
});

const objective = (keyResults: KeyResultInput[], over: Partial<ObjectiveInput> = {}) =>
  ({ id: 'o1', title: 'O', keyResults, ...over }) as ObjectiveInput;

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

describe('apportion', () => {
  it('splits evenly when ratios are equal', () => {
    expect(apportion(100, [1, 1])).toEqual([50, 50]);
    expect(apportion(100, [1, 1, 1, 1])).toEqual([25, 25, 25, 25]);
  });

  it('sums to exactly the total even when it does not divide evenly', () => {
    // 3 ways: the naive floor(100/3)*3 loses a point — largest-remainder keeps it.
    expect(sum(apportion(100, [1, 1, 1]))).toBe(100);
    expect(apportion(100, [1, 1, 1])).toEqual([34, 33, 33]);
    for (let n = 1; n <= 40; n++) {
      expect(sum(apportion(100, Array<number>(n).fill(1)))).toBe(100);
    }
  });

  it('preserves proportions', () => {
    expect(apportion(100, [40, 60])).toEqual([40, 60]);
    expect(apportion(100, [1, 3])).toEqual([25, 75]);
    expect(apportion(50, [40, 60])).toEqual([20, 30]);
  });

  it('falls back to an even split when every ratio is zero', () => {
    expect(apportion(100, [0, 0])).toEqual([50, 50]);
  });

  it('handles the empty and zero-total cases', () => {
    expect(apportion(100, [])).toEqual([]);
    expect(apportion(0, [1, 1])).toEqual([0, 0]);
  });
});

describe('normalizeObjectives', () => {
  it('pins every objective to 100%', () => {
    const out = normalizeObjectives([
      objective([kr()], { weight: 30 }),
      objective([kr()], { weight: 70 }),
    ]);
    expect(out.map((o) => o.weight)).toEqual([100, 100]);
  });

  it('forces key results to sum to 100, preserving their proportions', () => {
    const out = normalizeObjectives([
      objective([kr({ weight: 40 }), kr({ weight: 60 })]),
    ]);
    expect(out[0].keyResults.map((k) => k.weight)).toEqual([40, 60]);
  });

  it('rescues a set that does not add up', () => {
    // The old UI let you save 40/40 — silently rolling up as if it were 50/50.
    const out = normalizeObjectives([objective([kr({ weight: 40 }), kr({ weight: 40 })])]);
    expect(out[0].keyResults.map((k) => k.weight)).toEqual([50, 50]);
    expect(sum(out[0].keyResults.map((k) => k.weight))).toBe(100);
  });

  it('gives legacy key results with no weight an even split', () => {
    const out = normalizeObjectives([objective([kr(), kr(), kr()])]);
    expect(sum(out[0].keyResults.map((k) => k.weight))).toBe(100);
    expect(out[0].keyResults.map((k) => k.weight)).toEqual([34, 33, 33]);
  });

  it('defaults locked and clamps progress', () => {
    const out = normalizeObjectives([objective([kr({ progress: 400 })])]);
    expect(out[0].keyResults[0].locked).toBe(false);
    expect(out[0].keyResults[0].progress).toBe(100);
  });

  it('leaves an objective with no key results alone', () => {
    const out = normalizeObjectives([objective([])]);
    expect(out[0].keyResults).toEqual([]);
    expect(out[0].weight).toBe(100);
  });
});

describe('objectiveProgress', () => {
  it('weights key results by their share', () => {
    const [o] = normalizeObjectives([
      objective([kr({ weight: 40, progress: 100 }), kr({ weight: 60, progress: 0 })]),
    ]);
    expect(objectiveProgress(o)).toBe(40);
  });

  it('reflects a reweighting', () => {
    const [o] = normalizeObjectives([
      objective([kr({ weight: 60, progress: 100 }), kr({ weight: 40, progress: 0 })]),
    ]);
    expect(objectiveProgress(o)).toBe(60);
  });

  it('is 0 with no key results', () => {
    const [o] = normalizeObjectives([objective([])]);
    expect(objectiveProgress(o)).toBe(0);
  });
});

describe('milestoneProgress', () => {
  it('counts every objective equally', () => {
    const objectives = normalizeObjectives([
      objective([kr({ weight: 100, progress: 60 })]),
      objective([kr({ weight: 100, progress: 30 })], { id: 'o2' }),
    ]);
    expect(milestoneProgress(objectives)).toBe(45);
  });

  it('ignores any objective weight a client tries to send', () => {
    const objectives = normalizeObjectives([
      objective([kr({ weight: 100, progress: 60 })], { weight: 90 }),
      objective([kr({ weight: 100, progress: 30 })], { id: 'o2', weight: 10 }),
    ]);
    expect(milestoneProgress(objectives)).toBe(45);
  });

  it('is 0 with no objectives', () => {
    expect(milestoneProgress([])).toBe(0);
  });
});

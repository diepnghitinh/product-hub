import { scheduledOverlapExpr } from './issue.repository';

/**
 * The schedule filter is a Mongo `$expr`, so the rule it encodes isn't readable
 * from the object — and it is the rule that decides what "what did we get done
 * between these dates" returns. This evaluates the expression the way Mongo
 * would, over the handful of operators it uses, so the semantics are pinned
 * without standing a database up.
 */
type Doc = { startDate?: string; endDate?: string; dueDate?: string };

function evaluate(expr: unknown, doc: Doc): unknown {
  if (typeof expr === 'string') {
    return expr.startsWith('$') ? ((doc as Record<string, unknown>)[expr.slice(1)] ?? '') : expr;
  }
  if (expr === null || typeof expr !== 'object') return expr;
  const [op, args] = Object.entries(expr as Record<string, unknown>)[0];
  const list = (args as unknown[]).map((a) => evaluate(a, doc));
  switch (op) {
    case '$and':
      return list.every(Boolean);
    case '$cond':
      return list[0] ? list[1] : list[2];
    case '$ne':
      return list[0] !== list[1];
    case '$lte':
      return (list[0] as string) <= (list[1] as string);
    case '$gte':
      return (list[0] as string) >= (list[1] as string);
    default:
      throw new Error(`unsupported operator in the schedule filter: ${op}`);
  }
}

const matches = (doc: Doc, from?: string, to?: string) =>
  evaluate(scheduledOverlapExpr(from, to), doc) === true;

describe('scheduledOverlapExpr', () => {
  it('is skipped entirely when neither end is set', () => {
    expect(scheduledOverlapExpr()).toBeNull();
    expect(scheduledOverlapExpr('', '')).toBeNull();
  });

  it('keeps work that runs *through* the window, not only work that starts in it', () => {
    // The reason this is an overlap test: a task spanning all of July belongs to
    // every week of July, and a point-in-range filter would show none of them.
    const july = { startDate: '2026-07-01', endDate: '2026-07-31' };
    expect(matches(july, '2026-07-13', '2026-07-19')).toBe(true);
  });

  it('includes both boundary days', () => {
    const doc = { startDate: '2026-07-10', endDate: '2026-07-10' };
    expect(matches(doc, '2026-07-10', '2026-07-31')).toBe(true);
    expect(matches(doc, '2026-06-01', '2026-07-10')).toBe(true);
  });

  it('drops work that finishes before the window or starts after it', () => {
    expect(matches({ startDate: '2026-06-01', endDate: '2026-06-30' }, '2026-07-01', '2026-07-31')).toBe(false);
    expect(matches({ startDate: '2026-08-01', endDate: '2026-08-05' }, '2026-07-01', '2026-07-31')).toBe(false);
  });

  it('treats a one-ended issue as a single day on the end it has', () => {
    expect(matches({ endDate: '2026-07-15' }, '2026-07-01', '2026-07-31')).toBe(true);
    expect(matches({ startDate: '2026-07-15' }, '2026-07-01', '2026-07-31')).toBe(true);
    expect(matches({ endDate: '2026-08-15' }, '2026-07-01', '2026-07-31')).toBe(false);
  });

  it('still places a legacy task that only has dueDate', () => {
    expect(matches({ dueDate: '2026-07-20' }, '2026-07-01', '2026-07-31')).toBe(true);
  });

  it('excludes an unscheduled issue — it is not in any window', () => {
    expect(matches({}, '2026-07-01', '2026-07-31')).toBe(false);
    expect(matches({ startDate: '', endDate: '', dueDate: '' }, '2026-07-01')).toBe(false);
  });

  it('accepts either end alone as an open-ended range', () => {
    const doc = { startDate: '2026-07-10', endDate: '2026-07-12' };
    expect(matches(doc, '2026-07-01')).toBe(true);
    expect(matches(doc, undefined, '2026-07-31')).toBe(true);
    expect(matches(doc, '2026-08-01')).toBe(false);
    expect(matches(doc, undefined, '2026-06-30')).toBe(false);
  });

  it('reads a full instant as its UTC day, so an API caller’s filter still works', () => {
    const doc = { startDate: '2026-07-10', endDate: '2026-07-12' };
    expect(matches(doc, '2026-07-01T00:00:00.000Z', '2026-07-31T23:59:59.999Z')).toBe(true);
  });
});

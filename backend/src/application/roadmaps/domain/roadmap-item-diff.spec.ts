import { diffRoadmapItems } from './roadmap-item-diff';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'it1',
  shortId: 'RM-AAA',
  title: 'Login redesign',
  phase: 'now',
  assignees: [],
  ...over,
}) as never;

describe('diffRoadmapItems', () => {
  it('reports a phase move', () => {
    const out = diffRoadmapItems([item()], [item({ phase: 'done' })]);
    expect(out).toEqual([
      {
        itemId: 'it1',
        itemRef: 'RM-AAA',
        changes: [{ field: 'phase', oldValue: 'now', newValue: 'done' }],
      },
    ]);
  });

  it('IGNORES pure reordering — this is the whole point', () => {
    // One drag rewrites the entire array. Without this, moving a single item
    // emits a row for every other item that did not change at all.
    const a = item({ id: 'a', shortId: 'RM-A' });
    const b = item({ id: 'b', shortId: 'RM-B' });
    expect(diffRoadmapItems([a, b], [b, a])).toEqual([]);
  });

  it('reports an added item as created', () => {
    const out = diffRoadmapItems([], [item()]);
    expect(out[0].changes).toEqual([{ field: 'created', oldValue: '', newValue: '' }]);
  });

  it('reports a removed item as deleted', () => {
    const out = diffRoadmapItems([item()], []);
    expect(out[0].changes).toEqual([{ field: 'deleted', oldValue: '', newValue: '' }]);
  });

  it('reports nothing when nothing changed', () => {
    expect(diffRoadmapItems([item()], [item()])).toEqual([]);
  });

  it('records marking an item Done — status is NOT the same field as phase', () => {
    // The one row a user is most likely to come looking for: `status` is what
    // stamps startedAt/completedAt. Tracking only `phase` (the board pool) made
    // this produce zero rows, because a card can be moved to Done without its
    // column changing and vice versa.
    const out = diffRoadmapItems(
      [item({ status: 'in-progress' })],
      [item({ status: 'done' })],
    );
    expect(out).toEqual([
      {
        itemId: 'it1',
        itemRef: 'RM-AAA',
        changes: [{ field: 'status', oldValue: 'in-progress', newValue: 'done' }],
      },
    ]);
  });

  it('separates a status change from a phase move — both are recorded, as two rows', () => {
    const out = diffRoadmapItems(
      [item({ status: 'idea', phase: 'later' })],
      [item({ status: 'done', phase: 'now' })],
    );
    expect(out[0].changes).toEqual([
      { field: 'phase', oldValue: 'later', newValue: 'now' },
      { field: 'status', oldValue: 'idea', newValue: 'done' },
    ]);
  });

  it('records a description edit as an event but stores neither body', () => {
    const out = diffRoadmapItems(
      [item({ description: 'a'.repeat(4000) })],
      [item({ description: 'b'.repeat(4000) })],
    );
    expect(out[0].changes).toEqual([{ field: 'description', oldValue: '', newValue: '' }]);
  });

  it('records the planned window and the RICE inputs with their values', () => {
    const before = item({ startDate: '2026-01-01', endDate: '', confidence: 3 });
    const after = item({ startDate: '2026-02-01', endDate: '2026-03-01', confidence: 1 });
    expect(diffRoadmapItems([before], [after])[0].changes).toEqual([
      { field: 'startDate', oldValue: '2026-01-01', newValue: '2026-02-01' },
      { field: 'endDate', oldValue: '', newValue: '2026-03-01' },
      { field: 'confidence', oldValue: '3', newValue: '1' },
    ]);
  });

  it('ignores progress — it is derived from the sub-tasks, not set here', () => {
    // The stored number is a leftover from when Properties had a slider; the
    // percentage every response carries is computed (see `roadmap-progress.ts`),
    // and the event behind a change is a child's status move, logged on the child.
    const out = diffRoadmapItems([item({ progress: 0 })], [item({ progress: 50 })]);
    expect(out).toEqual([]);
  });

  it('ignores the server-stamped dates a status change causes', () => {
    // startedAt/completedAt are consequences of `status`, already recorded above.
    // Tracking them too would emit a second row with an identical timestamp.
    const out = diffRoadmapItems(
      [item({ status: 'done' })],
      [item({ status: 'done', startedAt: '2026-01-01', completedAt: '2026-01-02' })],
    );
    expect(out).toEqual([]);
  });

  it('records a title change with its real values — a rename IS the event', () => {
    const out = diffRoadmapItems([item()], [item({ title: 'Something else' })]);
    expect(out[0].changes).toEqual([
      { field: 'title', oldValue: 'Login redesign', newValue: 'Something else' },
    ]);
  });
});

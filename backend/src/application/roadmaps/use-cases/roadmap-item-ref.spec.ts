import { sequentialRef } from '@module-shared/utils/sequential-ref.util';
import { ReplaceRoadmapItemsUseCase } from './roadmap.use-cases';
import { RoadmapEntity } from '../domain/entities/roadmap.entity';
import { RoadmapDifficulty, RoadmapItemStatus, RoadmapPhase } from '../domain/enums/roadmap.enums';
import { ROADMAP_ITEM_REF_PREFIX, RoadmapItemData } from '../domain/types/roadmap-item.type';

/** The `CounterService` surface `sequentialRef` uses, plus a draw count. */
function counters(start = 0) {
  let seq = start;
  const draws: string[] = [];
  return {
    draws,
    next: async (_t: string, prefix: string) => {
      draws.push(prefix);
      return ++seq;
    },
    ensureAtLeast: async (_t: string, _p: string, value: number) => {
      seq = Math.max(seq, value);
    },
  };
}

describe('roadmap item refs', () => {
  it('mints RM-n from the tenant sequence, skipping refs already on the roadmap', async () => {
    const c = counters() as never;
    // A roadmap already holding RM-1 (embedded items are checked in memory,
    // since they are not their own collection).
    const taken = new Set(['RM-1']);

    const first = await sequentialRef(c, 't1', ROADMAP_ITEM_REF_PREFIX, async (r) => taken.has(r));
    expect(taken.has(first.ref)).toBe(false);

    taken.add(first.ref);
    const second = await sequentialRef(c, 't1', ROADMAP_ITEM_REF_PREFIX, async (r) => taken.has(r));
    expect(second.seq).toBeGreaterThan(first.seq);
  });
});

function item(over: Partial<RoadmapItemData> & { id: string }): RoadmapItemData {
  return {
    title: `Item ${over.id}`,
    description: '',
    phase: RoadmapPhase.NOW,
    status: RoadmapItemStatus.PLANNED,
    difficulty: RoadmapDifficulty.MEDIUM,
    reach: 0,
    impact: 0,
    confidence: 0,
    effort: 0,
    progress: 0,
    imageUrl: '',
    startDate: '',
    ...over,
  } as RoadmapItemData;
}

function roadmapWith(items: RoadmapItemData[]): RoadmapEntity {
  const roadmap = RoadmapEntity.create({ tenantId: 't1', title: 'Board' }).getValue();
  roadmap.replaceItems(items);
  return roadmap;
}

/**
 * The board replaces its whole item array on every edit and every drag, so this
 * use-case runs constantly against live data. Its `.map` became a sequential
 * `await` loop (each draw has to see the refs the previous ones took); these pin
 * the three properties a regression in that rewrite would break — and they are
 * the branch's central constraint in test form: an EXISTING item is never
 * renumbered and never re-stamped.
 */
describe('ReplaceRoadmapItemsUseCase', () => {
  function build(existing: RoadmapItemData[], counterAt = 0) {
    const roadmap = roadmapWith(existing);
    const c = counters(counterAt);
    const useCase = new ReplaceRoadmapItemsUseCase(
      {
        findById: async () => roadmap,
        update: async () => undefined,
      } as never,
      c as never,
      { execute: async () => undefined } as never,
    );
    return { useCase, roadmap, counters: c };
  }

  const CREATED = '2020-01-01T00:00:00.000Z';
  const STARTED = '2021-02-02T00:00:00.000Z';
  const COMPLETED = '2022-03-03T00:00:00.000Z';

  const stored = item({
    id: 'a',
    shortId: 'RM-7',
    status: RoadmapItemStatus.DONE,
    createdAt: CREATED,
    startedAt: STARTED,
    completedAt: COMPLETED,
  } as never);

  it('keeps an existing item’s ref and never draws a number for it', async () => {
    const { useCase, roadmap, counters: c } = build([stored]);

    const result = await useCase.execute({
      id: 'r1',
      tenantId: 't1',
      requesterId: 'u1',
      requesterName: 'Tester',
      // The client echoes a different shortId back; it must be ignored.
      dto: { items: [item({ id: 'a', shortId: 'RM-999' } as never)] } as never,
    });

    expect(result.isSuccess).toBe(true);
    expect(roadmap.items[0].shortId).toBe('RM-7');
    // A save must never renumber the board — nor burn a counter number doing it.
    expect(c.draws).toEqual([]);
  });

  it('preserves createdAt, startedAt and completedAt on an existing item', async () => {
    const { useCase, roadmap } = build([stored]);

    await useCase.execute({
      id: 'r1',
      tenantId: 't1',
      requesterId: 'u1',
      requesterName: 'Tester',
      dto: {
        items: [
          item({
            id: 'a',
            status: RoadmapItemStatus.PLANNED,
            createdAt: '1999-01-01T00:00:00.000Z',
            startedAt: '1999-01-01T00:00:00.000Z',
            completedAt: '1999-01-01T00:00:00.000Z',
          } as never),
        ],
      } as never,
    });

    // Server-owned: the client cannot backdate the clock, and moving the item
    // back to Planned does not erase the stamps it already earned.
    expect(roadmap.items[0]).toMatchObject({
      createdAt: CREATED,
      startedAt: STARTED,
      completedAt: COMPLETED,
    });
  });

  it('preserves the order the client sent, including new items interleaved', async () => {
    const a = item({ id: 'a', shortId: 'RM-1' } as never);
    const b = item({ id: 'b', shortId: 'RM-2' } as never);
    // Counter in step with the board — RM-1 and RM-2 are already handed out.
    const { useCase, roadmap, counters: c } = build([a, b], 2);

    await useCase.execute({
      id: 'r1',
      tenantId: 't1',
      requesterId: 'u1',
      requesterName: 'Tester',
      dto: {
        items: [
          item({ id: 'b' } as never),
          item({ id: 'new-1' } as never),
          item({ id: 'a' } as never),
          item({ id: 'new-2' } as never),
        ],
      } as never,
    });

    expect(roadmap.items.map((i) => i.id)).toEqual(['b', 'new-1', 'a', 'new-2']);
    // Existing refs survive the reorder; only the two new items drew.
    expect(roadmap.items.map((i) => i.shortId)).toEqual(['RM-2', 'RM-3', 'RM-1', 'RM-4']);
    expect(c.draws).toHaveLength(2);
  });

  it('stamps a brand-new item rather than trusting the request', async () => {
    const { useCase, roadmap } = build([]);

    await useCase.execute({
      id: 'r1',
      tenantId: 't1',
      requesterId: 'u1',
      requesterName: 'Tester',
      dto: {
        items: [item({ id: 'new-1', status: RoadmapItemStatus.IN_PROGRESS } as never)],
      } as never,
    });

    const [created] = roadmap.items;
    expect(created.shortId).toBe('RM-1');
    expect(created.createdAt).toBeTruthy();
    expect(created.startedAt).toBeTruthy();
    expect(created.completedAt).toBeUndefined();
  });

  /**
   * Who created an item is the axis the board's "Creator" filter narrows on, and
   * the board posts its WHOLE array back on every drag — so the three cases that
   * matter are a new item, an item that already has a creator, and a legacy item
   * that has none. The third is the trap: filling a blank creator in from the
   * requester looks like a harmless default and is actually the board silently
   * reassigning authorship of every old item to whoever dragged a card next.
   */
  describe('creator', () => {
    it('credits a new item to the requester, ignoring what the client sent', async () => {
      const { useCase, roadmap } = build([]);

      await useCase.execute({
        id: 'r1',
        tenantId: 't1',
        requesterId: 'u1',
        requesterName: 'Tester',
        dto: {
          items: [
            item({ id: 'new-1', createdById: 'someone-else', createdByName: 'Mallory' } as never),
          ],
        } as never,
      });

      expect(roadmap.items[0]).toMatchObject({ createdById: 'u1', createdByName: 'Tester' });
    });

    it('keeps an existing item’s creator when somebody else saves the board', async () => {
      const { useCase, roadmap } = build([
        item({ id: 'a', shortId: 'RM-1', createdById: 'u9', createdByName: 'Ana' } as never),
      ]);

      await useCase.execute({
        id: 'r1',
        tenantId: 't1',
        requesterId: 'u1',
        requesterName: 'Tester',
        dto: { items: [item({ id: 'a' } as never)] } as never,
      });

      expect(roadmap.items[0]).toMatchObject({ createdById: 'u9', createdByName: 'Ana' });
    });

    it('leaves a legacy item creatorless rather than crediting whoever saved next', async () => {
      const { useCase, roadmap } = build([item({ id: 'a', shortId: 'RM-1' } as never)]);

      await useCase.execute({
        id: 'r1',
        tenantId: 't1',
        requesterId: 'u1',
        requesterName: 'Tester',
        dto: { items: [item({ id: 'a' } as never)] } as never,
      });

      expect(roadmap.items[0].createdById).toBeUndefined();
      expect(roadmap.items[0].createdByName).toBeUndefined();
    });
  });
});

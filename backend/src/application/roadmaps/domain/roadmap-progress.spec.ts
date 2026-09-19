import { RoadmapItemStatus } from './enums/roadmap.enums';
import { roadmapItemProgress } from './roadmap-progress';

describe('roadmapItemProgress', () => {
  it('is the sub-tasks done ratio, rounded', () => {
    expect(roadmapItemProgress(RoadmapItemStatus.IN_PROGRESS, { total: 2, done: 1 })).toBe(50);
    expect(roadmapItemProgress(RoadmapItemStatus.IN_PROGRESS, { total: 3, done: 1 })).toBe(33);
    expect(roadmapItemProgress(RoadmapItemStatus.PLANNED, { total: 4, done: 4 })).toBe(100);
  });

  it('lets the sub-tasks contradict a hand-set status', () => {
    // The exact case this was written for: an item marked Done while one of its
    // two sub-tasks is still In progress. The work is half finished and the bar
    // must say so — the panel's own "1 of 2 done" has always said it.
    expect(roadmapItemProgress(RoadmapItemStatus.DONE, { total: 2, done: 1 })).toBe(50);
    expect(roadmapItemProgress(RoadmapItemStatus.IDEA, { total: 2, done: 2 })).toBe(100);
  });

  it('falls back to the item status when nothing is linked', () => {
    expect(roadmapItemProgress(RoadmapItemStatus.DONE)).toBe(100);
    expect(roadmapItemProgress(RoadmapItemStatus.DONE, { total: 0, done: 0 })).toBe(100);
    expect(roadmapItemProgress(RoadmapItemStatus.IN_PROGRESS)).toBe(0);
    expect(roadmapItemProgress(RoadmapItemStatus.IDEA, null)).toBe(0);
  });
});

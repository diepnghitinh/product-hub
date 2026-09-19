import { describe, expect, it } from 'vitest';
import { DEFAULT_ROADMAP_COLUMNS, RoadmapItemStatus } from '@/types/enums';
import type { RoadmapColumn } from '@/types/dto';
import { doneColumn, phaseForStatus, statusForPhase } from './itemStatusPhase';

/** The default four (now/next/later/done) plus a hand-made column, which is how
 *  a real board looks once someone has added "Blocked" in Manage columns. */
const columns: RoadmapColumn[] = [
  ...DEFAULT_ROADMAP_COLUMNS,
  { key: 'col-1a2b3c4d', label: 'Blocked', color: 'hsl(0 70% 58%)' },
];
/** A board whose Done column was hand-made — generated key, "Done" label. */
const renamed: RoadmapColumn[] = [
  { key: 'col-aaa', label: 'Now', color: '' },
  { key: 'col-bbb', label: 'Done', color: '' },
];
/** No Done column at all — nothing to derive, so nothing may move. */
const noDone: RoadmapColumn[] = [
  { key: 'now', label: 'Now', color: '' },
  { key: 'next', label: 'Next', color: '' },
];

describe('doneColumn', () => {
  it('prefers the default done key', () => {
    expect(doneColumn(columns)?.key).toBe('done');
  });
  it('falls back to the label for a hand-made column', () => {
    expect(doneColumn(renamed)?.key).toBe('col-bbb');
  });
  it('is undefined when the board has no Done column', () => {
    expect(doneColumn(noDone)).toBeUndefined();
  });
});

describe('phaseForStatus', () => {
  it('files a Done item under the Done column', () => {
    expect(phaseForStatus(RoadmapItemStatus.DONE, 'now', columns)).toBe('done');
    expect(phaseForStatus(RoadmapItemStatus.DONE, 'now', renamed)).toBe('col-bbb');
  });
  it('takes an item out of Done when it stops being done', () => {
    expect(phaseForStatus(RoadmapItemStatus.IN_PROGRESS, 'done', columns)).toBe('now');
  });
  it('leaves any other move to the person', () => {
    expect(phaseForStatus(RoadmapItemStatus.IN_PROGRESS, 'later', columns)).toBe('later');
    expect(phaseForStatus(RoadmapItemStatus.IDEA, 'col-1a2b3c4d', columns)).toBe('col-1a2b3c4d');
  });
  it('never moves a card on a board with no Done column', () => {
    expect(phaseForStatus(RoadmapItemStatus.DONE, 'now', noDone)).toBe('now');
  });
});

describe('statusForPhase', () => {
  it('marks a card dropped into Done as done', () => {
    expect(statusForPhase('done', RoadmapItemStatus.IDEA, columns)).toBe(RoadmapItemStatus.DONE);
  });
  it('un-marks a done card dragged back out', () => {
    expect(statusForPhase('now', RoadmapItemStatus.DONE, columns)).toBe(
      RoadmapItemStatus.IN_PROGRESS,
    );
  });
  it('leaves the status alone on every other move', () => {
    expect(statusForPhase('later', RoadmapItemStatus.PLANNED, columns)).toBe(
      RoadmapItemStatus.PLANNED,
    );
  });
  it('changes nothing on a board with no Done column', () => {
    expect(statusForPhase('now', RoadmapItemStatus.DONE, noDone)).toBe(RoadmapItemStatus.DONE);
  });
});

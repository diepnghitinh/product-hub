import { describe, expect, it } from 'vitest';
import { barSlots, columnsOf, MAX_FACES, packRow, periodCells, shiftPeriod } from './CalendarView';
import type { CalendarEvent } from './CalendarView';

/**
 * What a calendar bar can afford to show.
 *
 * A bar is one 18px line with no wrapping, so everything it carries competes for
 * the same strip: the title, the mini progress bar, the assignee faces. The
 * failure this file exists to catch is the silent one — the trailing cluster
 * drawn on a two-day bar, leaving a title clipped to "Vi…", which looks fine in
 * a screenshot of a wide month and useless in a narrow pane.
 *
 * Widths here are the bar's own, in px (day width × span, less the inset), which
 * is what the grid measures at runtime.
 */

const one = { progress: true, people: 1 };

describe('barSlots', () => {
  it('gives the title the whole bar when nothing else fits', () => {
    expect(barSlots(60, { progress: true, people: 3 })).toEqual({
      progress: false,
      faces: 0,
      extra: 0,
    });
  });

  it('shows nothing extra on a zero or negative width', () => {
    // 0 is what the hook reports before it has measured, and while the grid is
    // display:none below md — both mean "label only".
    expect(barSlots(0, { progress: true, people: 3 })).toEqual({
      progress: false,
      faces: 0,
      extra: 0,
    });
    expect(barSlots(-40, one)).toEqual({ progress: false, faces: 0, extra: 0 });
  });

  it('drops the percentage before it drops the faces', () => {
    // Room for one of the two: the percentage is the one a reader can get by
    // opening the item, so the face — "is this mine?" — outranks it.
    const narrow = barSlots(80, one);
    expect(narrow.progress).toBe(false);
    expect(narrow.faces).toBe(1);
  });

  it('shows both once the bar is wide enough', () => {
    const wide = barSlots(200, one);
    expect(wide).toMatchObject({ progress: true, faces: 1, extra: 0 });
  });

  it('never draws more than MAX_FACES, however wide the bar', () => {
    const roomy = barSlots(900, { progress: true, people: 9 });
    expect(roomy.faces).toBe(MAX_FACES);
    expect(roomy.extra).toBe(9 - MAX_FACES);
  });

  it('counts everyone hidden in the +N, not just the next one', () => {
    expect(barSlots(900, { progress: true, people: 12 }).extra).toBe(12 - MAX_FACES);
  });

  it('has no +N when everybody is already shown', () => {
    expect(barSlots(900, { progress: true, people: 2 })).toMatchObject({ faces: 2, extra: 0 });
  });

  it('never shows a +N with no face under it', () => {
    // A bar that can't afford a single face shows the label alone; a bare "+4"
    // on a coloured strip reads as part of the title.
    const tight = barSlots(70, { progress: false, people: 4 });
    expect(tight.faces).toBe(0);
    expect(tight.extra).toBe(0);
  });

  it('asks for no progress bar when the event has no percentage', () => {
    // The issue boards: a scheduled issue has no progress, so the bar must not
    // reserve room for one.
    expect(barSlots(900, { progress: false, people: 0 })).toEqual({
      progress: false,
      faces: 0,
      extra: 0,
    });
  });

  it('adds faces one at a time as the bar grows, never all-or-nothing', () => {
    const counts = [80, 100, 120, 140, 200, 400].map(
      (w) => barSlots(w, { progress: true, people: 3 }).faces,
    );
    // Monotonic: a wider bar never shows fewer faces than a narrower one.
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[counts.length - 1]).toBe(MAX_FACES);
  });

  /**
   * Widening a pane must never take something away. This is the property the
   * first cut of the budget quietly broke — it priced the percentage first, so
   * at the width where the meter became affordable it spent the room a face was
   * already using, and a face disappeared as the window grew. A sweep catches
   * that where hand-picked widths do not.
   */
  it('never takes anything away as the bar gets wider', () => {
    for (const people of [0, 1, 2, 3, 5]) {
      for (const progress of [false, true]) {
        let prev = { progress: false, faces: 0, extra: 0 };
        for (let w = 0; w <= 600; w += 1) {
          const now = barSlots(w, { progress, people });
          expect(now.faces).toBeGreaterThanOrEqual(prev.faces);
          expect(Number(now.progress)).toBeGreaterThanOrEqual(Number(prev.progress));
          // `extra` is a count of hidden people, not a width — it only ever goes
          // from "not shown" (0) to shown, never back.
          expect(now.extra === 0 && prev.extra > 0).toBe(false);
          prev = now;
        }
      }
    }
  });
});

/**
 * Which cells are on screen, and what an arrow steps by.
 *
 * Everything downstream — which bars get packed, which agenda cards exist, what
 * the header says — is derived from these two, so an off-by-one here is an
 * off-by-one everywhere. The cases worth pinning are the ones a calendar always
 * gets wrong: week boundaries, month ends, the 31st, and February.
 */
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const froms = (range: 'year' | 'month' | 'week' | 'day', anchor: Date) =>
  periodCells(range, anchor).map((c) => iso(c.from));

describe('periodCells', () => {
  it('draws a month as whole Monday-first weeks, including its neighbours', () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    const cells = periodCells('month', new Date(2026, 8, 15));
    expect(cells.length % 7).toBe(0);
    expect(iso(cells[0].from)).toBe('2026-08-31');
    expect(iso(cells[cells.length - 1].from)).toBe('2026-10-04');
  });

  it('gives a day range cells that are single days', () => {
    // `from === to` is what the whole day/week/month grid assumes; a month cell
    // is the only one that spans.
    for (const cell of periodCells('month', new Date(2026, 8, 15))) {
      expect(cell.to).toBe(cell.from);
    }
  });

  it('draws the Monday-to-Sunday week the day sits in, from any day of it', () => {
    for (const day of [14, 15, 18, 20]) {
      const cells = froms('week', new Date(2026, 8, day));
      expect(cells).toHaveLength(7);
      expect(cells[0]).toBe('2026-09-14');
      expect(cells[6]).toBe('2026-09-20');
    }
  });

  it('keeps a week whole across a month boundary', () => {
    // The week holding 1 Oct 2026 (a Thursday) starts in September.
    const cells = froms('week', new Date(2026, 9, 1));
    expect(cells[0]).toBe('2026-09-28');
    expect(cells[6]).toBe('2026-10-04');
  });

  it('draws a day as exactly that day', () => {
    expect(froms('day', new Date(2026, 8, 15))).toEqual(['2026-09-15']);
  });

  it('reads the anchor as a local date, never shifted by the timezone', () => {
    // A date built from local y/m/d must land on the same calendar day the user
    // sees, whichever side of UTC they're on — putting a day in the right box is
    // the calendar's whole job.
    expect(froms('day', new Date(2026, 0, 1))).toEqual(['2026-01-01']);
    expect(froms('day', new Date(2026, 11, 31))).toEqual(['2026-12-31']);
  });

  it('draws a year as twelve whole months, from any day of it', () => {
    const cells = periodCells('year', new Date(2026, 8, 15));
    expect(cells).toHaveLength(12);
    expect(iso(cells[0].from)).toBe('2026-01-01');
    expect(iso(cells[11].to)).toBe('2026-12-31');
    // Every month runs to its own last day — no gaps, no overlaps.
    expect(cells.map((c) => iso(c.to))[8]).toBe('2026-09-30');
    for (let i = 1; i < cells.length; i += 1) {
      expect(cells[i].from - cells[i - 1].to).toBe(86_400_000);
    }
  });

  it('gets February right in a leap year', () => {
    expect(iso(periodCells('year', new Date(2028, 5, 1))[1].to)).toBe('2028-02-29');
    expect(iso(periodCells('year', new Date(2026, 5, 1))[1].to)).toBe('2026-02-28');
  });
});

describe('columnsOf', () => {
  it('gives a year twelve columns and every day range seven', () => {
    expect(columnsOf('year')).toBe(12);
    for (const range of ['month', 'week', 'day'] as const) expect(columnsOf(range)).toBe(7);
  });

  it('lays every gridded range out in whole rows', () => {
    for (const range of ['year', 'month', 'week'] as const) {
      expect(periodCells(range, new Date(2026, 8, 15)).length % columnsOf(range)).toBe(0);
    }
  });
});

/**
 * How long a run looks.
 *
 * This is the question the year range exists to answer — "how many months does
 * this take?" is read off a bar's span, so the span has to be counted in cells
 * the bar actually touches. Subtracting stamps would work for days and be wrong
 * for months, which are not all the same length.
 */
describe('packRow', () => {
  const event = (id: string, start: string, end: string): CalendarEvent => ({ id, label: id, start, end });
  const year = periodCells('year', new Date(2026, 0, 1));

  it('spans a run over every month it touches, however little of each', () => {
    // 27 Feb → 2 May is three days short of three whole months and still covers
    // four columns, because it is on screen in all four.
    const [seg] = packRow(year, [event('a', '2026-02-27', '2026-05-02')]);
    expect([seg.col, seg.span]).toEqual([1, 4]);
  });

  it('puts a run inside one month in that one column', () => {
    const [seg] = packRow(year, [event('a', '2026-09-03', '2026-09-28')]);
    expect([seg.col, seg.span]).toEqual([8, 1]);
    expect(seg.clipStart).toBe(false);
    expect(seg.clipEnd).toBe(false);
  });

  it('clips a run that leaves the year, and keeps it on screen', () => {
    const [seg] = packRow(year, [event('a', '2025-11-04', '2026-03-10')]);
    expect([seg.col, seg.span]).toEqual([0, 3]);
    expect(seg.clipStart).toBe(true);
    expect(seg.clipEnd).toBe(false);
  });

  it('drops what the row never sees', () => {
    expect(packRow(year, [event('a', '2027-01-04', '2027-02-10')])).toHaveLength(0);
    expect(packRow(year, [event('a', '2025-01-04', '2025-02-10')])).toHaveLength(0);
  });

  it('counts days the same way it counts months', () => {
    const week = periodCells('week', new Date(2026, 8, 15)); // Mon 14 → Sun 20
    const [seg] = packRow(week, [event('a', '2026-09-16', '2026-09-18')]);
    expect([seg.col, seg.span]).toEqual([2, 3]);
  });

  it('stacks overlapping runs into separate lanes, longest on top', () => {
    const segs = packRow(year, [
      event('short', '2026-03-02', '2026-03-20'),
      event('long', '2026-01-05', '2026-06-30'),
    ]);
    const byId = Object.fromEntries(segs.map((s) => [s.event.id, s]));
    expect(byId.long.lane).toBe(0);
    expect(byId.short.lane).toBe(1);
  });

  it('reuses a lane for runs that do not overlap', () => {
    const segs = packRow(year, [
      event('q1', '2026-01-05', '2026-03-20'),
      event('q4', '2026-10-01', '2026-12-20'),
    ]);
    expect(segs.every((s) => s.lane === 0)).toBe(true);
  });
});

describe('shiftPeriod', () => {
  it('steps a year at a time, landing on its first day', () => {
    const next = shiftPeriod('year', new Date(2026, 8, 15), 1);
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2027, 0, 1]);
    const prev = shiftPeriod('year', new Date(2026, 8, 15), -1);
    expect([prev.getFullYear(), prev.getMonth(), prev.getDate()]).toEqual([2025, 0, 1]);
  });

  it('steps a month at a time, landing on the first', () => {
    const next = shiftPeriod('month', new Date(2026, 8, 15), 1);
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 9, 1]);
    const prev = shiftPeriod('month', new Date(2026, 0, 15), -1);
    expect([prev.getFullYear(), prev.getMonth(), prev.getDate()]).toEqual([2025, 11, 1]);
  });

  it('steps a week at a time, keeping the weekday', () => {
    const from = new Date(2026, 8, 15); // Tuesday
    const next = shiftPeriod('week', from, 1);
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 8, 22]);
    expect(next.getDay()).toBe(from.getDay());
  });

  it('steps a day at a time, over the end of a month', () => {
    const next = shiftPeriod('day', new Date(2026, 8, 30), 1);
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 9, 1]);
    const prev = shiftPeriod('day', new Date(2026, 0, 1), -1);
    expect([prev.getFullYear(), prev.getMonth(), prev.getDate()]).toEqual([2025, 11, 31]);
  });

  it('comes back where it started, in every range', () => {
    // Paging forward and back is the commonest thing anyone does with a calendar
    // and the easiest to break — a month step off the 31st is the classic.
    for (const range of ['year', 'month', 'week', 'day'] as const) {
      const from = range === 'month' || range === 'year' ? new Date(2026, 0, 1) : new Date(2026, 0, 31);
      const round = shiftPeriod(range, shiftPeriod(range, from, 1), -1);
      expect(iso(Date.UTC(round.getFullYear(), round.getMonth(), round.getDate()))).toBe(
        iso(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())),
      );
    }
  });
});

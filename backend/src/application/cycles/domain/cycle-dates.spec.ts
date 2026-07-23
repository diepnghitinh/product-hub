import {
  addDays,
  inclusiveDays,
  isoWeekday,
  parseISODate,
  startDayOnOrBefore,
  toISODate,
  todayISO,
} from './cycle-dates';

describe('cycle-dates', () => {
  it('round-trips ISO dates through UTC ms', () => {
    expect(toISODate(parseISODate('2026-07-23'))).toBe('2026-07-23');
    expect(toISODate(parseISODate('2026-01-01'))).toBe('2026-01-01');
    expect(toISODate(parseISODate('2026-12-31'))).toBe('2026-12-31');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29'); // leap year
  });

  it('is DST-proof: a 14-day hop lands exactly 14 days later around DST changes', () => {
    // US DST began 2026-03-08 and ends 2026-11-01; date-only math must not care.
    expect(addDays('2026-03-02', 14)).toBe('2026-03-16');
    expect(addDays('2026-10-26', 14)).toBe('2026-11-09');
  });

  it('maps weekdays to the 1=Monday…7=Sunday scale', () => {
    expect(isoWeekday('2026-07-20')).toBe(1); // Monday
    expect(isoWeekday('2026-07-23')).toBe(4); // Thursday
    expect(isoWeekday('2026-07-26')).toBe(7); // Sunday
  });

  it('finds the most recent start day on or before a date', () => {
    // 2026-07-23 is a Thursday.
    expect(startDayOnOrBefore('2026-07-23', 1)).toBe('2026-07-20'); // back to Monday
    expect(startDayOnOrBefore('2026-07-23', 4)).toBe('2026-07-23'); // already Thursday
    expect(startDayOnOrBefore('2026-07-23', 5)).toBe('2026-07-17'); // previous Friday
    expect(startDayOnOrBefore('2026-07-23', 7)).toBe('2026-07-19'); // previous Sunday
  });

  it('counts inclusive days (a 2-week cycle spans 14 days)', () => {
    expect(inclusiveDays('2026-07-20', '2026-07-20')).toBe(1);
    expect(inclusiveDays('2026-07-20', '2026-08-02')).toBe(14);
  });

  it('formats today in local time', () => {
    // Noon local: the local and UTC dates may differ, todayISO must use local.
    const noon = new Date(2026, 6, 23, 12, 0, 0);
    expect(todayISO(noon)).toBe('2026-07-23');
    const lateNight = new Date(2026, 6, 23, 23, 30, 0);
    expect(todayISO(lateNight)).toBe('2026-07-23');
  });
});

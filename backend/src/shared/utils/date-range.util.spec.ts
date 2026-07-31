import { dateRangeFilter } from './date-range.util';

describe('dateRangeFilter', () => {
  it('is undefined when neither end is given', () => {
    expect(dateRangeFilter(undefined, undefined)).toBeUndefined();
    expect(dateRangeFilter('', '')).toBeUndefined();
  });

  it('covers the whole closing day of a bare date range', () => {
    // The reason `to` is expanded at all: `2026-07-31` alone is midnight, which
    // would exclude everything that happened on the 31st.
    const range = dateRangeFilter('2026-07-01', '2026-07-31');
    expect(range?.$gte?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(range?.$lte?.toISOString()).toBe('2026-07-31T23:59:59.999Z');
  });

  it('keeps a full instant exactly as sent', () => {
    // What the app sends, having resolved the user's calendar day locally.
    const range = dateRangeFilter('2026-06-30T17:00:00.000Z', '2026-07-31T16:59:59.999Z');
    expect(range?.$gte?.toISOString()).toBe('2026-06-30T17:00:00.000Z');
    expect(range?.$lte?.toISOString()).toBe('2026-07-31T16:59:59.999Z');
  });

  it('allows an open-ended range at either end', () => {
    expect(Object.keys(dateRangeFilter('2026-07-01', undefined) ?? {})).toEqual(['$gte']);
    expect(Object.keys(dateRangeFilter(undefined, '2026-07-31') ?? {})).toEqual(['$lte']);
  });

  it('drops an unparseable endpoint rather than matching on Invalid Date', () => {
    expect(dateRangeFilter('not-a-date', undefined)).toBeUndefined();
  });
});

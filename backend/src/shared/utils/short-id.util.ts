/**
 * Human-friendly short id for test cases (e.g. `TC-4F9K2`). Not globally unique —
 * unique enough within a report; the internal UUID remains the real identity.
 */
export function shortId(prefix = 'TC'): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${rand}`;
}

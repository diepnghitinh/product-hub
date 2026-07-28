import { localeTag, t, type I18nKey } from '@/i18n';

/** Two-letter initials from a name (falls back to email, then "?"). */
export function initials(name: string, email: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** A file size a person can read at a glance: "812 KB", "2.4 MB". Deliberately
 *  coarse — the point is "is this big?", not the exact byte count. Units aren't
 *  translated: KB/MB read the same in every locale the app ships. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  // One decimal only while it still tells you something — "2.4 MB" vs "184 MB".
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Whole days between now and `input`, floored and never negative — the "5d"
 *  age shown on a card. */
export function daysSince(input: string | Date): number {
  const date = typeof input === 'string' ? new Date(input) : input;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

/** Whole days between two instants (`to − from`), floored and never negative —
 *  used for lead time (created→completed) and cycle time (started→completed). */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = typeof from === 'string' ? new Date(from) : from;
  const b = typeof to === 'string' ? new Date(to) : to;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));
}

/** Absolute calendar date, e.g. "Jul 15, 2026" / "2026년 7월 15일" — used for
 *  hover tooltips. The locale is the app's, not the OS's, so a date never comes
 *  out in a different language from the label next to it. */
export function formatDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleDateString(localeTag(), { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Date *and* time — for lists where several entries can share a day and the date
 * alone would make them look identical (a page's saved versions, say).
 */
export function formatDateTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleString(localeTag(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The count goes into the phrase, not in front of it — Korean puts the unit
 *  after the number ("3분 전") and other locales may want it elsewhere again. */
const ago = (key: I18nKey, n: number): string => t(key).replace('{n}', String(n));

/** Compact "updated 3d ago" style relative time. */
export function timeAgo(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return t('time.justNow');
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return ago('time.minutesAgo', mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ago('time.hoursAgo', hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return ago('time.daysAgo', days);
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return ago('time.weeksAgo', weeks);
  const months = Math.floor(days / 30);
  if (months < 12) return ago('time.monthsAgo', months);
  return ago('time.yearsAgo', Math.floor(days / 365));
}

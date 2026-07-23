import { t } from '@/i18n';
import { CycleStatus } from '@/types/enums';
import type { CycleDto } from '@/types/dto';

/** Date-only helpers for cycle math. Cycle dates are `YYYY-MM-DD` (inclusive),
 *  the same convention as issue start/end — parsed at UTC midnight and rendered
 *  with `timeZone: 'UTC'` so a date-only value never shifts a day locally. */
const DAY_MS = 86_400_000;

export const parseDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const dayDiff = (from: string, to: string) =>
  Math.round((parseDay(to) - parseDay(from)) / DAY_MS);

export const addDays = (iso: string, n: number) =>
  new Date(parseDay(iso) + n * DAY_MS).toISOString().slice(0, 10);

/** Compact "Jul 20". */
export const shortDay = (iso: string) =>
  new Date(parseDay(iso)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/** The user's local calendar date — how the backend derives cycle status too. */
export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "4 days left" / "last day" for an active cycle's end date. */
export function daysLeftLabel(endDate: string): string {
  const left = dayDiff(todayIso(), endDate);
  if (left <= 0) return t('cycles.lastDay');
  return `${left} ${left === 1 ? t('cycles.dayLeft') : t('cycles.daysLeft')}`;
}

/** One canonical display name for a cycle: "Cycle 12 · Jul 20 – Aug 2". */
export function cycleLabel(c: CycleDto): string {
  return `${t('cycles.cycle')} ${c.number} · ${shortDay(c.startDate)} – ${shortDay(c.endDate)}`;
}

/** Status → Badge variant + label, shared by the cycles page and the board
 *  banner so the two never drift on colour or wording. */
export function cycleStatusBadge(status: CycleStatus): {
  variant: 'success' | 'secondary' | 'muted';
  label: string;
} {
  if (status === CycleStatus.ACTIVE) return { variant: 'success', label: t('cycles.current') };
  if (status === CycleStatus.UPCOMING) return { variant: 'secondary', label: t('cycles.upcoming') };
  return { variant: 'muted', label: t('cycles.completed') };
}

/** The row's time hint: "4 days left" (active) · "starts Jul 21" (upcoming) ·
 *  "" (completed — the dates already tell the whole story). */
export function cycleTimeHint(c: CycleDto): string {
  if (c.status === CycleStatus.ACTIVE) return daysLeftLabel(c.endDate);
  if (c.status === CycleStatus.UPCOMING) return `${t('cycles.starts')} ${shortDay(c.startDate)}`;
  return '';
}

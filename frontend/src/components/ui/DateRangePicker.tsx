import { useMemo, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Calendar, CalendarRange, ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface DateRange {
  /** ISO calendar date `YYYY-MM-DD`, '' when unset. */
  start: string;
  end: string;
}

/** A sidebar quick-pick. `range()` returns the ISO endpoints it applies. */
export interface DateRangePreset {
  /** Stable id used to highlight the active preset (falls back to `label`). */
  key?: string;
  label: string;
  range: () => DateRange;
}

export interface DateRangePickerProps {
  /** Range endpoints as `YYYY-MM-DD` (controlled). Empty strings = unset. */
  start?: string;
  end?: string;
  onChange: (range: DateRange) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Show the × clear affordance when either endpoint is set. Default true. */
  clearable?: boolean;
  /** Earliest / latest selectable date, as `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  /**
   * Sidebar quick-picks. Defaults to a forward-looking set (Today, Tomorrow,
   * This week, Next 7/30 days, This month) suited to a deadline. Pass `[]` to
   * hide the sidebar, or {@link reportDateRangePresets} for a backward-looking
   * (analytics) set.
   */
  presets?: DateRangePreset[];
  className?: string;
  id?: string;
  'aria-invalid'?: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n: number) => String(n).padStart(2, '0');
/** Local (timezone-safe) `YYYY-MM-DD` — never round-trips through UTC. */
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s?: string): Date | null => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};
const short = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
/** `Apr 23, 2026` — the editable input's display form. */
const longDate = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
/** `23 Apr 2026` — the trigger's display form. */
const triggerDate = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
/** Order two dates low→high. */
const order = (a: Date, b: Date): [Date, Date] => (a <= b ? [a, b] : [b, a]);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const endOfWeek = (d: Date) => addDays(d, 6 - d.getDay()); // Sunday-based week → Saturday
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/**
 * Human range label reused by the trigger and by read-only callers:
 *   • both set → `12 Aug → 20 Aug`
 *   • one set  → that single date (so a migrated deadline still reads like one)
 *   • none     → '' (caller shows its placeholder)
 */
export function formatDateRange(start?: string, end?: string): string {
  const s = parseISO(start);
  const e = parseISO(end);
  if (s && e) return sameDay(s, e) ? short(s) : `${short(s)} → ${short(e)}`;
  if (s) return short(s);
  if (e) return short(e);
  return '';
}

/** Forward-looking quick-picks for a deadline (default). */
export function forwardDateRangePresets(today = new Date()): DateRangePreset[] {
  const single = (d: Date): DateRange => ({ start: toISO(d), end: toISO(d) });
  const from = (endD: Date): DateRange => ({ start: toISO(today), end: toISO(endD) });
  return [
    { key: 'today', label: 'Today', range: () => single(today) },
    { key: 'tomorrow', label: 'Tomorrow', range: () => single(addDays(today, 1)) },
    { key: 'this-week', label: 'This week', range: () => from(endOfWeek(today)) },
    { key: 'next-7', label: 'Next 7 days', range: () => from(addDays(today, 6)) },
    { key: 'next-30', label: 'Next 30 days', range: () => from(addDays(today, 29)) },
    { key: 'this-month', label: 'This month', range: () => from(endOfMonth(today)) },
  ];
}

/** Backward-looking quick-picks for analytics/filters (opt-in). */
export function reportDateRangePresets(today = new Date()): DateRangePreset[] {
  const to = (startD: Date): DateRange => ({ start: toISO(startD), end: toISO(today) });
  return [
    { key: 'last-7', label: 'Last 7 days', range: () => to(addDays(today, -6)) },
    { key: 'last-30', label: 'Last 30 days', range: () => to(addDays(today, -29)) },
    { key: 'last-90', label: 'Last 90 days', range: () => to(addDays(today, -89)) },
    { key: 'last-365', label: 'Last 365 days', range: () => to(addDays(today, -364)) },
    {
      key: 'last-12-months',
      label: 'Last 12 months',
      range: () => to(new Date(today.getFullYear(), today.getMonth() - 11, today.getDate())),
    },
    {
      key: 'last-week',
      label: 'Last week',
      range: () => {
        const start = addDays(today, -today.getDay() - 7);
        return { start: toISO(start), end: toISO(addDays(start, 6)) };
      },
    },
  ];
}

/**
 * Start→End date range picker — a token-styled trigger over a staged popover
 * (two editable date inputs · a forward-looking preset sidebar · a hand-rolled
 * month calendar · Cancel / Apply), reading/writing plain `YYYY-MM-DD` strings.
 *
 * Editing is **staged**: changes live in a local draft and only reach `onChange`
 * on **Apply**, so Cancel or dismissing the popover is a clean no-op. In the
 * calendar, two clicks make a range (hovering previews the span); presets or the
 * inputs set both endpoints at once. Endpoints paint in the brand primary, the
 * in-between span in the accent fill.
 */
export function DateRangePicker({
  start,
  end,
  onChange,
  placeholder = 'Pick dates',
  disabled,
  clearable = true,
  min,
  max,
  presets,
  className,
  id,
  'aria-invalid': ariaInvalid,
}: DateRangePickerProps) {
  const committedStart = useMemo(() => parseISO(start), [start]);
  const committedEnd = useMemo(() => parseISO(end), [end]);
  const minDate = useMemo(() => parseISO(min), [min]);
  const maxDate = useMemo(() => parseISO(max), [max]);
  const presetList = useMemo(() => presets ?? forwardDateRangePresets(), [presets]);

  const [open, setOpen] = useState(false);
  const [triggerHover, setTriggerHover] = useState(false);
  // Staged draft — committed to onChange only on Apply.
  const [dStart, setDStart] = useState<Date | null>(null);
  const [dEnd, setDEnd] = useState<Date | null>(null);
  const [view, setView] = useState(() => committedStart ?? committedEnd ?? new Date());
  // In-progress calendar selection (first-picked endpoint + hover preview).
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  // Editable inputs: raw text + focus, so typing shows ISO and blur shows pretty.
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [startFocused, setStartFocused] = useState(false);
  const [endFocused, setEndFocused] = useState(false);

  const today = new Date();
  const triggerLabel = useMemo(() => {
    if (committedStart && committedEnd) {
      return sameDay(committedStart, committedEnd)
        ? triggerDate(committedStart)
        : `${triggerDate(committedStart)} – ${triggerDate(committedEnd)}`;
    }
    if (committedStart) return triggerDate(committedStart);
    if (committedEnd) return triggerDate(committedEnd);
    return '';
  }, [committedStart, committedEnd]);
  const hasValue = Boolean(committedStart || committedEnd);

  // 6 weeks × 7 days grid covering the current view month.
  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay()); // back to the Sunday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [view]);

  const isDisabled = (d: Date): boolean =>
    Boolean(
      (minDate && d < minDate && !sameDay(d, minDate)) ||
        (maxDate && d > maxDate && !sameDay(d, maxDate)),
    );

  // The span to paint: an in-progress selection (anchor + hover), else the draft
  // range, else a single draft endpoint on its own.
  const [lo, hi] = useMemo<[Date | null, Date | null]>(() => {
    if (anchor) return hover ? order(anchor, hover) : [anchor, anchor];
    if (dStart && dEnd) return order(dStart, dEnd);
    const one = dStart ?? dEnd;
    return one ? [one, one] : [null, null];
  }, [anchor, hover, dStart, dEnd]);

  // Which preset (if any) the current draft equals — else "Custom".
  const activePreset = useMemo(() => {
    if (!dStart) return null;
    const cs = toISO(dStart);
    const ce = dEnd ? toISO(dEnd) : '';
    const match = presetList.find((p) => {
      const r = p.range();
      return r.start === cs && r.end === ce;
    });
    return match ? match.key ?? match.label : 'custom';
  }, [dStart, dEnd, presetList]);

  const resetDraftFromProps = () => {
    setDStart(committedStart);
    setDEnd(committedEnd);
    setAnchor(null);
    setHover(null);
    setStartText('');
    setEndText('');
    setStartFocused(false);
    setEndFocused(false);
    setView(committedStart ?? committedEnd ?? new Date());
  };

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    if (!anchor) {
      setAnchor(d);
      setDStart(d);
      setDEnd(null);
      setHover(null);
      return;
    }
    const [a, b] = order(anchor, d);
    setDStart(a);
    setDEnd(b);
    setAnchor(null);
    setHover(null);
  };

  const applyPreset = (p: DateRangePreset) => {
    const r = p.range();
    const s = parseISO(r.start);
    const e = parseISO(r.end);
    setDStart(s);
    setDEnd(e);
    setAnchor(null);
    setHover(null);
    if (s) setView(s);
  };

  const shiftMonth = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const commit = () => {
    onChange({ start: dStart ? toISO(dStart) : '', end: dEnd ? toISO(dEnd) : '' });
    setOpen(false);
  };

  // ── editable-input handlers ──
  const commitStartText = () => {
    const parsed = parseISO(startText);
    if (parsed && !isDisabled(parsed)) {
      setDStart(parsed);
      setView(parsed);
      setAnchor(null);
      if (dEnd && parsed > dEnd) setDEnd(parsed); // keep start ≤ end
    }
  };
  const commitEndText = () => {
    if (endText.trim() === '') {
      setDEnd(null);
      return;
    }
    const parsed = parseISO(endText);
    if (parsed && !isDisabled(parsed)) {
      setDEnd(parsed);
      setView(parsed);
      setAnchor(null);
      if (dStart && parsed < dStart) setDStart(parsed); // keep start ≤ end
    }
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) resetDraftFromProps();
      }}
    >
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          aria-invalid={ariaInvalid}
          onMouseEnter={() => setTriggerHover(true)}
          onMouseLeave={() => setTriggerHover(false)}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
            className,
          )}
        >
          <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('flex-1 truncate text-left', !hasValue && 'text-muted-foreground')}>
            {triggerLabel || placeholder}
          </span>
          {clearable && hasValue && !disabled && triggerHover ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear dates"
              onClick={(e) => {
                e.stopPropagation();
                onChange({ start: '', end: '' });
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </span>
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          // Don't grab the start input on open — it should read "Jul 22, 2026",
          // not raw ISO, and on mobile this keeps the keyboard from popping up.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-[92vw] max-w-[480px] overflow-hidden rounded-lg border bg-popover p-0 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onMouseLeave={() => setHover(null)}
        >
          {/* ── Dual date inputs ── */}
          <div className="flex items-center gap-2 border-b p-2">
            <DateField
              value={startFocused ? startText : dStart ? longDate(dStart) : ''}
              placeholder="Start date"
              clearable={clearable && !!dStart}
              onFocus={() => {
                setStartFocused(true);
                setStartText(dStart ? toISO(dStart) : '');
              }}
              onBlur={() => {
                setStartFocused(false);
                commitStartText();
              }}
              onChange={setStartText}
              onClear={() => {
                setDStart(null);
                setAnchor(null);
                setStartText('');
              }}
            />
            <DateField
              value={endFocused ? endText : dEnd ? longDate(dEnd) : ''}
              placeholder="End date"
              clearable={clearable && !!dEnd}
              onFocus={() => {
                setEndFocused(true);
                setEndText(dEnd ? toISO(dEnd) : '');
              }}
              onBlur={() => {
                setEndFocused(false);
                commitEndText();
              }}
              onChange={setEndText}
              onClear={() => {
                setDEnd(null);
                setEndText('');
              }}
            />
          </div>

          {/* ── Presets + calendar ── */}
          <div className="flex flex-col sm:flex-row">
            {presetList.length > 0 && (
              <div className="flex flex-wrap gap-0.5 border-b p-2 sm:w-[172px] sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
                {presetList.map((p) => {
                  const isActive = activePreset === (p.key ?? p.label);
                  const hint = short(parseISO(p.range().end) ?? today);
                  return (
                    <button
                      key={p.key ?? p.label}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        'sm:w-full',
                        isActive
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <span className="whitespace-nowrap">{p.label}</span>
                      <span
                        className={cn(
                          'hidden whitespace-nowrap text-xs sm:inline',
                          isActive ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {hint}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={cn(
                    'flex items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors sm:w-full',
                    activePreset === 'custom'
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-foreground hover:bg-accent',
                  )}
                  // "Custom" is a status, not an action — it lights up when the
                  // draft matches no preset. Clicking it is a harmless no-op.
                  onClick={() => undefined}
                >
                  Custom
                </button>
              </div>
            )}

            {/* Calendar */}
            <div className="flex-1 p-2">
              {/* Header: month · Today · month steppers */}
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">
                  {MONTHS[view.getMonth()]} {view.getFullYear()}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setView(new Date())}
                    className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => shiftMonth(-1)}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => shiftMonth(1)}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
              </div>

              {/* Weekday header */}
              <div className="mb-1 grid grid-cols-7">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="grid size-8 place-items-center text-xs font-normal text-muted-foreground"
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7">
                {grid.map((d) => {
                  const outside = d.getMonth() !== view.getMonth();
                  const isLo = lo && sameDay(d, lo);
                  const isHi = hi && sameDay(d, hi);
                  const isEndpoint = isLo || isHi;
                  const inRange = lo && hi && d > lo && d < hi && !sameDay(lo, hi);
                  const isToday = sameDay(d, today);
                  const off = isDisabled(d);
                  return (
                    <div
                      key={d.toISOString()}
                      className={cn(
                        // The range fill is a full-cell band; the rounded ends cap it.
                        inRange && 'bg-accent',
                        isLo && hi && !sameDay(lo!, hi!) && 'rounded-l-md bg-accent',
                        isHi && lo && !sameDay(lo!, hi!) && 'rounded-r-md bg-accent',
                      )}
                    >
                      <button
                        type="button"
                        disabled={off}
                        onClick={() => pick(d)}
                        onMouseEnter={() => anchor && !off && setHover(d)}
                        className={cn(
                          'grid size-8 place-items-center rounded-md text-sm transition-colors',
                          'hover:bg-accent hover:text-accent-foreground',
                          outside && 'text-muted-foreground/60',
                          inRange && 'hover:bg-accent',
                          isToday && !isEndpoint && 'border border-input',
                          isEndpoint &&
                            'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                          off && 'pointer-events-none opacity-40',
                        )}
                      >
                        {d.getDate()}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-end gap-2 border-t p-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={commit}>
              Apply
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** One of the two editable endpoint inputs (icon · text · clear). */
function DateField({
  value,
  placeholder,
  clearable,
  onFocus,
  onBlur,
  onChange,
  onClear,
}: {
  value: string;
  placeholder: string;
  clearable: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-input bg-background px-2.5 focus-within:ring-1 focus-within:ring-ring">
      <Calendar className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {clearable && (
        <button
          type="button"
          aria-label={`Clear ${placeholder.toLowerCase()}`}
          // Fire before blur so the endpoint clears instead of re-committing text.
          onMouseDown={(e) => {
            e.preventDefault();
            onClear();
          }}
          className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

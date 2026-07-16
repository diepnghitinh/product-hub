import { useMemo, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  /** ISO calendar date `YYYY-MM-DD` (controlled). Empty = no date. */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Show the × clear affordance when a date is set. Default true. */
  clearable?: boolean;
  /** Earliest / latest selectable date, as `YYYY-MM-DD`. */
  min?: string;
  max?: string;
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
const formatDisplay = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Single date picker — a token-styled trigger over a hand-rolled month calendar
 * in a Radix Popover (no date library). Reads/writes plain `YYYY-MM-DD` strings,
 * so it's a drop-in for a native `<input type="date">`.
 *
 * The trigger uses only tokens that stay valid inside themed islands like the
 * report workspace; the calendar is portaled (app scope), matching the other
 * pickers here.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  clearable = true,
  min,
  max,
  className,
  id,
  'aria-invalid': ariaInvalid,
}: DatePickerProps) {
  const selected = useMemo(() => parseISO(value), [value]);
  const minDate = useMemo(() => parseISO(min), [min]);
  const maxDate = useMemo(() => parseISO(max), [max]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ?? new Date());

  const today = new Date();

  // 6 weeks × 7 days grid covering the current view month.
  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay()); // back to the Sunday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [view]);

  const isDisabled = (d: Date): boolean =>
    Boolean(
      (minDate && d < minDate && !sameDay(d, minDate)) ||
        (maxDate && d > maxDate && !sameDay(d, maxDate)),
    );

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
  };

  const shiftMonth = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setView(selected ?? new Date());
      }}
    >
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          aria-invalid={ariaInvalid}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
            className,
          )}
        >
          <Calendar className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('flex-1 truncate text-left', !selected && 'text-muted-foreground')}>
            {selected ? formatDisplay(selected) : placeholder}
          </span>
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </span>
          )}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-auto rounded-md border bg-popover p-3 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Month nav */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-sm font-medium">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
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
              const isSelected = selected && sameDay(d, selected);
              const isToday = sameDay(d, today);
              const off = isDisabled(d);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={off}
                  onClick={() => pick(d)}
                  className={cn(
                    'grid size-8 place-items-center rounded-md text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    outside && 'text-muted-foreground/60',
                    isToday && !isSelected && 'border border-input',
                    isSelected &&
                      'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                    off && 'pointer-events-none opacity-40',
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <button
              type="button"
              onClick={() => pick(today)}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
            >
              Today
            </button>
            {clearable && selected && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

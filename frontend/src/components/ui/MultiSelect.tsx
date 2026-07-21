import { useMemo, type ReactNode } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu';

export interface MultiSelectOption {
  label: ReactNode;
  value: string;
  /** Plain-text form of a rich `label`, used for the "Remove" aria-label. */
  text?: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  /** Selected values (controlled). */
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: ReactNode;
  className?: string;
  /** Collapse to "N selected" once more than this many are chosen. */
  maxDisplay?: number;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
}

/**
 * Pick several values from a list. The trigger shows each choice as a removable
 * chip (or a count once there are many); the menu is the shared dropdown with
 * checkbox items. Reuses the existing dropdown-menu + Badge primitives.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  className,
  maxDisplay = 3,
  disabled,
  id,
  'aria-invalid': ariaInvalid,
}: MultiSelectProps) {
  const selected = useMemo(
    () => value.map((v) => options.find((o) => o.value === v) ?? { label: v, value: v }),
    [value, options],
  );

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <div
          id={id}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-invalid={ariaInvalid}
          className={cn(
            'flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:ring-1 data-[state=open]:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-[invalid=true]:border-destructive',
            className,
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {selected.length === 0 && (
              <span className="px-1 text-muted-foreground">{placeholder}</span>
            )}
            {selected.length > maxDisplay ? (
              <span className="px-1">{selected.length} selected</span>
            ) : (
              selected.map((o) => (
                <Badge key={o.value} variant="secondary" className="gap-1 pr-1">
                  {o.label}
                  <button
                    type="button"
                    aria-label={`Remove ${o.text ?? (typeof o.label === 'string' ? o.label : o.value)}`}
                    className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(o.value);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        {options.map((o) => (
          // Left-aligned content with the tick on the right (not the default
          // left-indented checkbox item), so a colour-dot label reads from the edge.
          <DropdownMenuItem
            key={o.value}
            disabled={o.disabled}
            onSelect={(e) => {
              e.preventDefault();
              toggle(o.value);
            }}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2 truncate">{o.label}</span>
            {value.includes(o.value) && <Check className="size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
